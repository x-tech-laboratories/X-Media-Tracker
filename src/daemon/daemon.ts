// The desktop app's daemon: everything X-Media-Tracker does without a window, being the database, its backups, covers,
// plugins, sync, scheduled imports and release checks, and reading this computer's Steam and Lutris. The window reaches
// it over a Unix socket with the same calls a browser makes to the web server, and closing the window leaves it running.

// ── Imports ──────────────────────────────────────────────────────────────────

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import fastify, { type FastifyInstance } from "fastify";
import { keep_backing_up, type BackupSchedule } from "@x-tech-laboratories/x-libs/backups";
import { create_certificate_trust } from "@x-tech-laboratories/x-libs/certificates";
import { DaemonRunningError, listen_on_socket } from "@x-tech-laboratories/x-libs/local_daemon";
import { folder_file_store } from "@x-tech-laboratories/x-libs/node_file_store";
import { load_plugin_folder, read_plugin_file } from "@x-tech-laboratories/x-libs/plugin_folder";
import { register_call_table } from "@x-tech-laboratories/x-libs/server/call_table";
import { EventStream } from "@x-tech-laboratories/x-libs/server/events";
import { register_error_replies, register_lenient_json_body } from "@x-tech-laboratories/x-libs/server/replies";
import { sqlite_backups } from "@x-tech-laboratories/x-libs/server/sqlite_backups";
import { create_sync_peer, sync_device_methods } from "@x-tech-laboratories/x-libs/sync_peer";
import { keep_listening_for_peers } from "@x-tech-laboratories/x-libs/sync_peer_listening";
import { file_sync_storage } from "@x-tech-laboratories/x-libs/sync_file_storage";

import { media_backup_naming, read_schedule } from "../shared/backups.ts";
import { keep_checking_releases } from "../shared/books/schedule.ts";
import { keep_fetching_covers, referenced_covers } from "../shared/covers.ts";
import { read_desktop_settings, type DaemonMethods, type DesktopSettings } from "../shared/desktop.ts";
import { keep_reading_steam_categories } from "../shared/games/schedule.ts";
import { steam_manifest } from "../shared/games/manifests.ts";
import type { DeviceMethods, LauncherMethods, PluginFileMethods, SteamFileMethods } from "../shared/page_api.ts";
import { is_switched_on, plugin_settings, use_folder_plugins, type MediaPluginApi } from "../shared/plugins/host.ts";
import { keep_importing } from "../shared/sources/schedule.ts";
import { bind_methods, is_read_only, needs_upgrade, open_store, sync_engine } from "../shared/store.ts";
import { register_cover_files, register_media_calls } from "../server/calls.ts";
import { read_local_lutris_games } from "./lutris.ts";
import { read_local_steam_categories } from "./steam_categories.ts";

// ── Options ──────────────────────────────────────────────────────────────────

export interface MediaDaemonOptions {
  database_path: string;
  socket_path: string;
  // Runs once the daemon has stopped, such as to end the process.
  on_stopped: () => void;
  // Whether the scheduled imports, release checks, Steam category reads and cover downloads run; on unless false.
  schedules?: boolean;
  // How long it waits after its last window closed before it stops, when it is not to keep running in the background.
  unused_exit_ms?: number;
  unused_check_ms?: number;
  // The port other devices reach this computer's sync on once it lets them connect.
  default_peer_port?: number;
}

export interface MediaDaemon {
  // Stops the schedules, sync, the socket and the database, then runs on_stopped; a second call does nothing.
  shut_down: () => Promise<void>;
}

// ── Daemon ───────────────────────────────────────────────────────────────────

// Answers on the socket and starts its work; null when another daemon on the same database already answers.
export async function start_media_daemon(options: MediaDaemonOptions): Promise<MediaDaemon | null> {
  const { database_path, socket_path } = options;
  const profile = dirname(database_path);
  const backups_folder = join(profile, "backups");
  const unused_exit_ms = options.unused_exit_ms ?? 30_000;
  const unused_check_ms = options.unused_check_ms ?? 5000;

  // ── Database and backups ───────────────────────────────────────────────

  function open_database(): DatabaseSync {
    const opened = new DatabaseSync(database_path);
    opened.exec("PRAGMA journal_mode = WAL");
    return opened;
  }

  mkdirSync(profile, { recursive: true });
  let database = open_database();

  // Every window's event stream, told when the data changed or sync's status moved.
  const changes = new EventStream();

  const kept = sqlite_backups({
    folder: () => {
      mkdirSync(backups_folder, { recursive: true });
      return backups_folder;
    },
    naming: media_backup_naming,
    database: () => database,
    database_path: () => database_path,
    close: () => database.close(),
    open: () => {
      database = open_database();
      open_store(database);
    },
    after_restore: (restored) => sync_engine.forget_history(restored),
  });

  if (needs_upgrade(database)) await kept.create();
  open_store(database);

  // The schedule belongs to this device, so it is kept beside the database rather than in the synced settings.
  const schedule_file = join(profile, "backup-schedule.json");
  const read_backup_schedule = (): BackupSchedule => read_schedule(existsSync(schedule_file) ? JSON.parse(readFileSync(schedule_file, "utf8")) : null);
  const backing_up = keep_backing_up(kept, read_backup_schedule);

  // ── Covers and plugins ─────────────────────────────────────────────────

  // Kept beside the database, and shown to the window through its cover scheme.
  const covers = folder_file_store(join(profile, "covers"));
  const fetching_covers = options.schedules === false ? null : keep_fetching_covers({ database: () => database, store: covers, on_change: () => changes.announce_change() });

  // A write may have changed a cover's address, so the covers are looked at again soon after.
  function announce(client_id?: string): void {
    changes.announce_change(client_id);
    fetching_covers?.soon();
  }

  // Plugins the user installed in the profile, each run with the app's full rights; their store side joins every plugin
  // host, and the window imports their web side through its calls.
  const plugins_folder = join(profile, "plugins");
  const loaded = await load_plugin_folder<MediaPluginApi>(plugins_folder, "store");
  use_folder_plugins(loaded.plugins);
  for (const problem of loaded.problems) console.warn(`plugin ${problem.name}: ${problem.problem}`);

  // ── Sync ───────────────────────────────────────────────────────────────

  // Server certificates the user trusted, such as a home server's self-signed one, handed to Node's own fetch.
  const certificates = create_certificate_trust({ file: join(profile, "trusted-certificates.json"), use_in_node: true });

  // Off until "Let other devices connect" is turned on; then other devices reach this computer's sync on its port.
  const listening = keep_listening_for_peers({ peer: () => sync, app: "x-media-tracker", file: join(profile, "sync-listening.json"), default_port: options.default_peer_port ?? 7751 });

  // This computer is one sync peer among the devices, its covers travelling as files.
  const sync = create_sync_peer({
    app: "x-media-tracker",
    engine: sync_engine,
    database: () => database,
    storage: file_sync_storage({ file: join(profile, "sync-peers.json"), back_up_before_replace: async () => void (await kept.create()) }),
    files: { store: covers, referenced: referenced_covers },
    device_name: `X-Media-Tracker on ${hostname()}`,
    addresses: () => listening.addresses(),
    on_remote_change: () => announce(),
    on_status: (status) => changes.send(JSON.stringify(status), { event: "sync_status" }),
  });

  // ── This computer ──────────────────────────────────────────────────────

  // The Steam client's categories of the profile set in Steam's plugin, read from this computer; none while it is off.
  function read_steam_categories(): string {
    if (!is_switched_on(database, steam_manifest)) return "";
    return read_local_steam_categories(String(plugin_settings(database, steam_manifest).profile).trim());
  }

  const steam_files: SteamFileMethods = { read_steam_categories };
  const launchers: LauncherMethods = { list_lutris_games: read_local_lutris_games };
  const plugin_files: PluginFileMethods = { read_plugin_file: (path) => read_plugin_file(plugins_folder, path) };

  const device: DeviceMethods = {
    ...sync_device_methods(sync),
    list_backups: kept.list,
    create_backup: () => kept.create(),
    restore_backup: async (name) => {
      await kept.restore(name);
      announce();
    },
    remove_backup: kept.remove,
    get_backup_schedule: read_backup_schedule,
    set_backup_schedule: (schedule) => {
      writeFileSync(schedule_file, JSON.stringify(read_schedule(schedule), null, 2));
      void backing_up.check();
    },
  };

  // ── Desktop settings ───────────────────────────────────────────────────

  const desktop_file = join(profile, "desktop.json");

  function read_desktop(): DesktopSettings {
    return read_desktop_settings(existsSync(desktop_file) ? JSON.parse(readFileSync(desktop_file, "utf8")) : null);
  }

  const daemon_methods: DaemonMethods = {
    get_desktop_settings: read_desktop,
    set_desktop_setting: (key, value) => writeFileSync(desktop_file, JSON.stringify(read_desktop_settings({ ...read_desktop(), [key]: value }), null, 2)),
    // Stops once the answer has gone back.
    stop_daemon: () => void setTimeout(() => void shut_down(), 0),
  };

  // ── Calls ──────────────────────────────────────────────────────────────

  const daemon: FastifyInstance = fastify({ bodyLimit: 32 * 1024 * 1024, forceCloseConnections: true });
  register_lenient_json_body(daemon);
  register_error_replies(daemon);
  // A change from one window reaches the others; the one that made it already shows it.
  const tell_others = (client_id: string): void => announce(client_id);
  await daemon.register(
    async (api) => {
      changes.register(api, "/events");
      register_media_calls(api, () => database, (request) => announce(changes.client_id_of(request)));
      register_cover_files(api, covers);
      register_call_table(api, "/device", device, { is_read_only, on_change: tell_others });
      register_call_table(api, "/peer_listening", listening.methods, { is_read_only });
      register_call_table(api, "/certificates", certificates.methods, { is_read_only });
      register_call_table(api, "/steam_files", steam_files, { is_read_only });
      register_call_table(api, "/launchers", launchers, { is_read_only });
      register_call_table(api, "/plugin_files", plugin_files, { is_read_only });
      register_call_table(api, "/daemon", daemon_methods, { is_read_only, on_change: tell_others });
    },
    { prefix: "/api" },
  );

  // ── Lifecycle ──────────────────────────────────────────────────────────

  let stopping: Promise<void> | null = null;
  let unused_timer: ReturnType<typeof setInterval> | undefined;
  let stop_schedules = (): void => undefined;

  function shut_down(): Promise<void> {
    stopping ??= (async () => {
      clearInterval(unused_timer);
      stop_schedules();
      fetching_covers?.stop();
      sync.stop();
      backing_up.stop();
      await daemon.close();
      await listening.stop();
      database.close();
      options.on_stopped();
    })();
    return stopping;
  }

  try {
    await listen_on_socket(socket_path, (path) => daemon.listen({ path }));
  } catch (error) {
    fetching_covers?.stop();
    backing_up.stop();
    await daemon.close();
    database.close();
    // Another daemon on this database got there first, which is all that was asked for.
    if (error instanceof DaemonRunningError) return null;
    throw error;
  }

  await listening.start();
  sync.start();
  if (options.schedules !== false) {
    const methods = () => bind_methods(() => database, () => undefined);
    const stops = [
      keep_importing(methods, () => announce()),
      keep_checking_releases(methods, () => announce()),
      keep_reading_steam_categories(methods, () => announce(), read_steam_categories),
    ];
    stop_schedules = () => stops.forEach((stop) => stop());
  }

  // Without "Keep running in the background", the daemon stops a while after its last window has gone.
  let unused_since = Date.now();
  unused_timer = setInterval(() => {
    if (changes.client_count > 0 || read_desktop().keep_running_in_background) unused_since = Date.now();
    else if (Date.now() - unused_since >= unused_exit_ms) void shut_down();
  }, unused_check_ms);

  return { shut_down };
}
