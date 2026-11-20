// The desktop app: its own database in the profile folder, the page's calls answered on it, daily backups beside it,
// and sync with a server when one is set, so it works offline and catches up once the server answers.

// ── Imports ──────────────────────────────────────────────────────────────────

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { app, BrowserWindow, ipcMain, nativeTheme, protocol, screen, session, shell } from "electron";
import { bring_to_front, hold_single_instance } from "@x-tech-laboratories/x-libs/electron/app";
import type { IpcMainEventLike } from "@x-tech-laboratories/x-libs/electron/bridge";
import { create_window, is_app_page } from "@x-tech-laboratories/x-libs/electron/window";
import { keep_backing_up, type BackupSchedule } from "@x-tech-laboratories/x-libs/backups";
import { sqlite_backups } from "@x-tech-laboratories/x-libs/server/sqlite_backups";
import { create_certificate_trust } from "@x-tech-laboratories/x-libs/certificates";
import { trust_in_session, trusting_fetch } from "@x-tech-laboratories/x-libs/electron/certificates";
import { register_file_scheme, serve_files } from "@x-tech-laboratories/x-libs/electron/file_protocol";
import { folder_file_store } from "@x-tech-laboratories/x-libs/node_file_store";
import { create_sync_client, sync_device_methods } from "@x-tech-laboratories/x-libs/sync_client";
import { file_sync_storage } from "@x-tech-laboratories/x-libs/sync_file_storage";

import { media_backup_naming, read_schedule } from "../shared/backups.ts";
import { certificate_bridge, device_bridge, launchers_bridge, media_bridge, media_events, steam_files_bridge } from "../shared/bridge.ts";
import { keep_fetching_covers, referenced_covers, type KeepFetchingCovers } from "../shared/covers.ts";
import { cover_scheme } from "../shared/page_api.ts";
import { keep_checking_releases } from "../shared/books/schedule.ts";
import { keep_syncing_stores } from "../shared/games/schedule.ts";
import { launcher_schemes } from "../shared/games/launch.ts";
import { games_setting } from "../shared/games/store.ts";
import { keep_importing } from "../shared/sources/schedule.ts";
import { stremio_scheme } from "../shared/sources/stremio/links.ts";
import { bind_methods, needs_upgrade, open_store, sync_engine } from "../shared/store.ts";
import { read_local_lutris_games } from "./lutris.ts";
import { read_local_steam_categories } from "./steam_categories.ts";

// ── Profile ──────────────────────────────────────────────────────────────────

// Dev runs set this so they never touch the installed app's data.
if (process.env.X_MEDIA_TRACKER_USER_DATA) app.setPath("userData", join(process.cwd(), process.env.X_MEDIA_TRACKER_USER_DATA));

const profile = app.getPath("userData");
const backups_folder = join(profile, "backups");

// ── Database ─────────────────────────────────────────────────────────────────

const database_path = join(profile, "media.db");
mkdirSync(profile, { recursive: true });
let database = new DatabaseSync(database_path);
database.exec("PRAGMA journal_mode = WAL");

// ── Backups ──────────────────────────────────────────────────────────────────

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
    database = new DatabaseSync(database_path);
    database.exec("PRAGMA journal_mode = WAL");
    open_store(database);
  },
  after_restore: (restored) => sync_engine.forget_history(restored),
});

if (needs_upgrade(database)) await kept.create();
open_store(database);

// The schedule belongs to this device, so it is kept beside the database rather than in the synced settings.
const schedule_file = join(profile, "backup-schedule.json");

function read_backup_schedule(): BackupSchedule {
  return read_schedule(existsSync(schedule_file) ? JSON.parse(readFileSync(schedule_file, "utf8")) : null);
}

const backing_up = keep_backing_up(kept, read_backup_schedule);

// ── Covers ───────────────────────────────────────────────────────────────────

// Kept beside the database and shown to the page as x-media-cover://<name>.
const covers = folder_file_store(join(profile, "covers"));
register_file_scheme(protocol, cover_scheme);
let fetching_covers: KeepFetchingCovers | undefined;

let stop_importing = (): void => undefined;
let stop_checking_releases = (): void => undefined;
let stop_syncing_stores = (): void => undefined;

// The Steam client's categories of the profile set in Settings, read from this computer.
function read_steam_categories(): string {
  return read_local_steam_categories(String(games_setting(database, "games.steam_id")).trim());
}

function announce_change(): void {
  media_events.emit(BrowserWindow.getAllWindows(), "changed", null);
}

// A write may have changed a cover's address, so the covers are looked at again soon after.
function after_write(): void {
  announce_change();
  fetching_covers?.soon();
}

// ── Sync ─────────────────────────────────────────────────────────────────────

// Server certificates the user trusted, such as a home server's self-signed one, kept beside the database.
const certificates = create_certificate_trust({ file: join(profile, "trusted-certificates.json") });

const sync = create_sync_client({
  engine: sync_engine,
  database: () => database,
  storage: file_sync_storage({ file: join(profile, "sync.json"), back_up_before_download: async () => void (await kept.create()) }),
  files: { store: covers, referenced: referenced_covers },
  data_name: "media library",
  device_name: `X-Media-Tracker on ${hostname()}`,
  on_remote_change: announce_change,
  on_status: (status) => media_events.emit(BrowserWindow.getAllWindows(), "sync_status", status),
  // Chromium's network stack honours the trusted certificates, which Node's own fetch would not.
  fetch: trusting_fetch(session, certificates),
});

// ── Window ───────────────────────────────────────────────────────────────────

const page = {
  dev_url: app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL,
  file: join(import.meta.dirname, "../renderer/index.html"),
};

function open_window(): BrowserWindow {
  return create_window(BrowserWindow, {
    ...page,
    title: "X-Media-Tracker",
    icon: join(import.meta.dirname, "../../resources/icon.png"),
    // electron-vite emits an ESM preload as .mjs; loading .js here silently yields no bridge.
    preload: join(import.meta.dirname, "../preload/index.mjs"),
    default_size: { width: 1100, height: 760 },
    min_size: { width: 360, height: 480 },
    native_theme: nativeTheme,
    shell,
    // The title page's "Open in Stremio" button and a game page's launch buttons open the installed apps.
    external_schemes: [stremio_scheme, ...launcher_schemes],
    screen,
    state_file: join(profile, "window.json"),
  });
}

// ── Start ────────────────────────────────────────────────────────────────────

// Only the app's own page may call in, never a site a link led to.
function trusted(event: IpcMainEventLike): boolean {
  return is_app_page(event.senderFrame?.url ?? "", page);
}

function show_existing_window(): void {
  const [window] = BrowserWindow.getAllWindows();
  if (window) bring_to_front(window);
}

if (hold_single_instance(app, show_existing_window)) {
  void app.whenReady().then(() => {
    serve_files(protocol, cover_scheme, covers);
    media_bridge.handle(ipcMain, bind_methods(() => database, after_write), { trusted, envelopes: true });
    certificate_bridge.handle(ipcMain, certificates.methods, { trusted, envelopes: true });
    trust_in_session(session.defaultSession, certificates.is_trusted);
    steam_files_bridge.handle(ipcMain, { read_steam_categories }, { trusted, envelopes: true });
    launchers_bridge.handle(ipcMain, { list_lutris_games: read_local_lutris_games }, { trusted, envelopes: true });
    device_bridge.handle(
      ipcMain,
      {
        ...sync_device_methods(sync),
        list_backups: kept.list,
        create_backup: () => kept.create(),
        // The restored data no longer matches the server's, so sync waits until the user picks which copy wins.
        restore_backup: async (name) => {
          sync.disconnect();
          await kept.restore(name);
          announce_change();
        },
        remove_backup: kept.remove,
        get_backup_schedule: read_backup_schedule,
        set_backup_schedule: (schedule) => {
          writeFileSync(schedule_file, JSON.stringify(read_schedule(schedule), null, 2));
          void backing_up.check();
        },
      },
      { trusted, envelopes: true },
    );
    open_window();
    sync.start();
    fetching_covers = keep_fetching_covers({ database: () => database, store: covers, on_change: announce_change });
    stop_importing = keep_importing(() => bind_methods(() => database, () => undefined), after_write);
    stop_checking_releases = keep_checking_releases(() => bind_methods(() => database, () => undefined), after_write);
    stop_syncing_stores = keep_syncing_stores(() => bind_methods(() => database, () => undefined), after_write, read_steam_categories);
  });

  app.on("window-all-closed", () => {
    stop_importing();
    stop_checking_releases();
    stop_syncing_stores();
    fetching_covers?.stop();
    sync.stop();
    backing_up.stop();
    database.close();
    app.quit();
  });
}
