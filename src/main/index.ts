// The desktop app's window: Electron's main process, which shows X-Media-Tracker and keeps its login entry, and leaves
// the work to this computer's daemon in src/daemon or to the X-Media-Tracker server chosen under Settings → Connections.

// ── Imports ──────────────────────────────────────────────────────────────────

import { watchFile } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";

import { app, BrowserWindow, dialog, ipcMain, nativeTheme, protocol, screen, shell } from "electron";
import { launch_command, set_autostart } from "@x-tech-laboratories/x-libs/autostart";
import { backup_method_names } from "@x-tech-laboratories/x-libs/backup_protocol";
import { certificate_method_names } from "@x-tech-laboratories/x-libs/certificate_protocol";
import { create_certificate_trust } from "@x-tech-laboratories/x-libs/certificates";
import { connection_file_storage } from "@x-tech-laboratories/x-libs/connection_file_storage";
import { create_connections } from "@x-tech-laboratories/x-libs/connections";
import { create_daemon_link } from "@x-tech-laboratories/x-libs/daemon_link";
import { create_daemon_router, default_local_tables } from "@x-tech-laboratories/x-libs/daemon_router";
import { bring_to_front, hold_single_instance } from "@x-tech-laboratories/x-libs/electron/app";
import type { Implementation, IpcMainEventLike } from "@x-tech-laboratories/x-libs/electron/bridge";
import { file_response, register_file_scheme } from "@x-tech-laboratories/x-libs/electron/file_protocol";
import { create_window, is_app_page } from "@x-tech-laboratories/x-libs/electron/window";
import { call_daemon, daemon_log_path, daemon_socket_path, start_daemon } from "@x-tech-laboratories/x-libs/local_daemon";
import { folder_file_store } from "@x-tech-laboratories/x-libs/node_file_store";
import { peer_listening_method_names } from "@x-tech-laboratories/x-libs/sync_protocol";

import {
  backup_bridge,
  certificate_bridge,
  connection_bridge,
  desktop_bridge,
  device_bridge,
  launchers_bridge,
  media_bridge,
  media_events,
  peer_listening_bridge,
  plugin_files_bridge,
  steam_files_bridge,
} from "../shared/bridge.ts";
import type { DesktopMethods, DesktopSettings } from "../shared/desktop.ts";
import { launcher_schemes } from "../shared/games/launch.ts";
import { cover_scheme, device_method_names, is_read_only, launcher_method_names, steam_file_method_names, type PluginFileMethods } from "../shared/page_api.ts";
import { stremio_scheme } from "../shared/sources/stremio/links.ts";
import { method_names } from "../shared/store.ts";
import { remote_file_url } from "./remote_files.ts";

// ── Profile ──────────────────────────────────────────────────────────────────

// Dev runs set this so they never touch the installed app's data.
const is_own_profile = process.env.X_MEDIA_TRACKER_USER_DATA === undefined;
if (!is_own_profile) app.setPath("userData", join(process.cwd(), process.env.X_MEDIA_TRACKER_USER_DATA!));

const profile = app.getPath("userData");
const database_path = join(profile, "media.db");

// Any other profile gets a daemon, socket and log of its own, so a dev or test run never reaches the user's daemon.
const socket_path = daemon_socket_path({ app: "x-media-tracker", data_file: is_own_profile ? null : database_path });
const log_file = is_own_profile ? daemon_log_path("x-media-tracker") : join(profile, "daemon.log");

// The built app sits in out/main, and resources/ beside out/ both in the source tree and in the package.
const icon_path = join(import.meta.dirname, "../../resources/icon.png");

// The command that starts this app again, which the login entry runs.
const own_command = (args: string[]): string[] =>
  launch_command({ launcher: process.env.X_MEDIA_TRACKER_LAUNCHER, is_packaged: app.isPackaged, app_path: app.getAppPath(), args });

// Must be named before the app is ready, so the page may load covers from it.
register_file_scheme(protocol, cover_scheme);

// ── Daemon ───────────────────────────────────────────────────────────────────

function ensure_daemon(): Promise<unknown> {
  return start_daemon({
    socket_path,
    script: join(import.meta.dirname, "daemon.js"),
    env: { X_MEDIA_TRACKER_DB: database_path, X_MEDIA_TRACKER_SOCKET: socket_path },
    log_file,
  });
}

// ── Connections ──────────────────────────────────────────────────────────────

// Certificates the user trusted, read again whenever the daemon saves the list, so calls to a server honour them.
const certificates_file = join(profile, "trusted-certificates.json");
const trust_certificates = (): void => void create_certificate_trust({ file: certificates_file, use_in_node: true });
trust_certificates();
watchFile(certificates_file, { interval: 2000 }, trust_certificates);

// This computer's daemon, and X-Media-Tracker servers each signed in once with a token of this device's own.
const connections = create_connections({ storage: connection_file_storage(join(profile, "connections.json")), offers_local: true, device_name: `X-Media-Tracker on ${hostname()}` });
const link = create_daemon_link({ connections, socket_path });

// Calls and change events go to the chosen daemon; this computer's sync, Steam and launchers stay on its own.
const router = create_daemon_router({
  connections,
  link,
  call_local: (path, args, headers) => call_daemon(socket_path, path, args, headers),
  restart_local: ensure_daemon,
  local_tables: [...default_local_tables, "peer_listening", "steam_files", "launchers"],
  is_read_only,
  on_change: () => {
    media_events.emit(BrowserWindow.getAllWindows(), "changed", null);
    void apply_window_settings().catch(() => undefined);
  },
  on_sync_status: (status) => media_events.emit(BrowserWindow.getAllWindows(), "sync_status", status),
  on_switch: () => {
    for (const window of BrowserWindow.getAllWindows()) window.webContents.reload();
  },
});
const { call, forwarded, is_here } = router;

// A file a server serves by GET, such as a cover or a plugin's page side, fetched with this device's token.
async function fetch_remote(path: string): Promise<Response> {
  const daemon = connections.current();
  if (daemon?.kind !== "remote") return new Response(null, { status: 404 });
  return fetch(remote_file_url(daemon.address, path), { headers: { authorization: `Bearer ${daemon.token}` } }).catch(() => new Response(null, { status: 502 }));
}

// Covers come from this computer's folder, or from the server the window works on.
const covers = folder_file_store(join(profile, "covers"));

function cover_response(request: Request): Promise<Response> {
  return is_here() ? file_response(covers, request.url) : fetch_remote(`covers/${new URL(request.url).hostname}`);
}

// The plugins of the daemon the window works on, whose page sides the page imports.
const plugin_files: Implementation<PluginFileMethods> = {
  read_plugin_file: async (path) => {
    if (is_here()) return (await call("plugin_files/read_plugin_file", [path])) as string;
    const response = await fetch_remote(`plugins/${path}`);
    return response.ok ? response.text() : "";
  },
};

// This computer's own settings, always from its own daemon.
function get_desktop_settings(): Promise<DesktopSettings> {
  return call("daemon/get_desktop_settings") as Promise<DesktopSettings>;
}

// Only the user's own profile starts at login; a dev run never writes the login entry.
async function apply_window_settings(): Promise<void> {
  if (!is_own_profile) return;
  const settings = await get_desktop_settings();
  set_autostart(
    { id: "x-media-tracker-daemon", name: "X-Media-Tracker in the background", comment: "Sync, imports and backups for X-Media-Tracker", icon: icon_path, command: own_command(["--daemon"]) },
    settings.start_at_login && settings.keep_running_in_background,
  );
}

// ── Window ───────────────────────────────────────────────────────────────────

const page = {
  dev_url: app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL,
  file: join(import.meta.dirname, "../renderer/index.html"),
};

function open_window(): BrowserWindow {
  return create_window(BrowserWindow, {
    ...page,
    title: "X-Media-Tracker",
    icon: icon_path,
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

function show_window(): void {
  bring_to_front(BrowserWindow.getAllWindows()[0] ?? open_window());
}

// Stops the daemon as well, so nothing runs until the app is opened again.
async function quit_completely(): Promise<void> {
  router.quitting();
  await call("daemon/stop_daemon").catch(() => undefined);
  app.quit();
}

// ── Bridges ──────────────────────────────────────────────────────────────────

// Only the app's own page may call in, never a site a link led to.
function trusted(event: IpcMainEventLike): boolean {
  return is_app_page(event.senderFrame?.url ?? "", page);
}

// The page's calls go to the chosen daemon, but for the connections, quitting and the settings the window acts on.
function register_bridges(): void {
  const options = { trusted, envelopes: true };
  media_bridge.handle(ipcMain, forwarded(method_names, "call") as never, options);
  device_bridge.handle(ipcMain, forwarded(device_method_names, "device") as never, options);
  // This computer's backups sit with its sync; a server's are an admin's, beside its other calls.
  backup_bridge.handle(ipcMain, forwarded(backup_method_names, () => (is_here() ? "device" : "backup")) as never, options);
  peer_listening_bridge.handle(ipcMain, forwarded(peer_listening_method_names, "peer_listening") as never, options);
  certificate_bridge.handle(ipcMain, forwarded(certificate_method_names, "certificates") as never, options);
  steam_files_bridge.handle(ipcMain, forwarded(steam_file_method_names, "steam_files") as never, options);
  launchers_bridge.handle(ipcMain, forwarded(launcher_method_names, "launchers") as never, options);
  plugin_files_bridge.handle(ipcMain, plugin_files, options);
  connection_bridge.handle(ipcMain, connections.methods, options);
  const desktop: Implementation<DesktopMethods> = {
    get_desktop_settings,
    set_desktop_setting: async (key, value) => {
      await call("daemon/set_desktop_setting", [key, value]);
      await apply_window_settings();
    },
    quit_completely,
  };
  desktop_bridge.handle(ipcMain, desktop, options);
}

// ── Start ────────────────────────────────────────────────────────────────────

function start_app(): void {
  void app.whenReady().then(async () => {
    try {
      await ensure_daemon();
    } catch (error) {
      dialog.showErrorBox("X-Media-Tracker could not start", `${error instanceof Error ? error.message : String(error)}\n\nSee ${log_file}.`);
      app.exit(1);
      return;
    }
    protocol.handle(cover_scheme, cover_response);
    register_bridges();
    router.start();
    await apply_window_settings().catch(() => undefined);
    show_window();
  });

  app.on("will-quit", () => router.stop());

  // Closing the window ends only the window; the daemon runs on.
  app.on("window-all-closed", () => app.quit());
}

// `x-media-tracker-desktop --daemon`, as the login entry runs it, starts only the daemon.
async function start_daemon_alone(): Promise<void> {
  try {
    await ensure_daemon();
    app.exit(0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    app.exit(1);
  }
}

// A second launch brings the window forward, but one that only starts the daemon leaves the window be.
function open_from_second_launch(argv: string[]): void {
  if (!argv.includes("--daemon")) show_window();
}

if (process.argv.includes("--daemon")) void start_daemon_alone();
else if (hold_single_instance(app, open_from_second_launch)) start_app();
