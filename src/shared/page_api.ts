// What the page knows of its host without loading the store: the names the calls travel under, and the api's shape.
// The browser build imports only this, so the stores and Drizzle stay out of the page a server serves.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { Client } from "@x-tech-laboratories/x-libs/electron/bridge";
import { backup_method_names, type BackupClient, type BackupMethods } from "@x-tech-laboratories/x-libs/backup_protocol";
import type { CertificateClient } from "@x-tech-laboratories/x-libs/certificate_protocol";
import { sync_device_method_names, type SyncDeviceMethods, type SyncStatus } from "@x-tech-laboratories/x-libs/sync_protocol";

import type { LutrisGame } from "./games/launch.ts";
import type { MediaMethods } from "./store.ts";

// ── Names ────────────────────────────────────────────────────────────────────

export const media_api_name = "x_media_tracker";
export const device_api_name = "x_media_tracker_device";
export const events_api_name = "x_media_tracker_events";
export const certificates_api_name = "x_media_tracker_certificates";
export const steam_files_api_name = "x_media_tracker_steam_files";
export const launchers_api_name = "x_media_tracker_launchers";
export const plugin_files_api_name = "x_media_tracker_plugin_files";
// The desktop page's scheme for the covers kept on the device, as x-media-cover://<name>.
export const cover_scheme = "x-media-cover";

// ── Device calls ─────────────────────────────────────────────────────────────

// Sync with a server and backups of the device's own database; a browser is already on the server.
export type DeviceMethods = SyncDeviceMethods & BackupMethods;

export const device_method_names = [...sync_device_method_names, ...backup_method_names] as const;

// The Steam client's files on the desktop's own computer.
export interface SteamFileMethods {
  // The library categories file, or "" when Steam is not installed here.
  read_steam_categories: () => string;
}

export const steam_file_method_names = ["read_steam_categories"] as const;

// The game launchers installed on the desktop's own computer.
export interface LauncherMethods {
  // The games installed in Lutris, or none when Lutris is not installed here.
  list_lutris_games: () => LutrisGame[];
}

export const launcher_method_names = ["list_lutris_games"] as const;

// The web sides of the desktop's plugins folder, which the page imports as a server's page would.
export interface PluginFileMethods {
  // "index.json" for the list of web entries, as the server's /api/plugins/index.json gives it, else a file as "<plugin>/<path>"; "" when there is none.
  read_plugin_file: (path: string) => string;
}

export const plugin_file_method_names = ["read_plugin_file"] as const;

// Where the desktop page pretends its plugin files are, so their addresses resolve against each other.
export const desktop_plugin_base = "x-media-plugins://local/";

// What the main process tells the page on its own: the data changed elsewhere, or sync's status moved.
export type MediaEvents = { changed: null; sync_status: SyncStatus };

// ── The page's api ───────────────────────────────────────────────────────────

export type Host = "web" | "desktop" | "android";

export interface PageApi {
  host: Host;
  calls: Client<MediaMethods>;
  // Null in a browser, which syncs nothing itself.
  device: Client<DeviceMethods> | null;
  // The backups of whichever database the page works on: the device's own, or the server's for a browser; left out where
  // none are offered, and Settings then shows no Backups section.
  backups?: BackupClient;
  // Where a phone keeps its backups: a folder the user picks once, with no backups until then.
  backup_folder?: { get: () => Promise<string>; choose: () => Promise<string> };
  // Set where the app makes its own connections and can trust a certificate the system refuses.
  certificates?: CertificateClient;
  // Set on the desktop, which can read the Steam client's files.
  steam_files?: Client<SteamFileMethods>;
  // Set on the desktop, which can see the launchers installed on it.
  launchers?: Client<LauncherMethods>;
  // Set on the desktop, whose plugins folder is in its profile; a browser loads the server's from /api/plugins/.
  plugin_files?: Client<PluginFileMethods>;
  // Where the page shows a kept cover from, by its file's name, or "" while this device does not have it yet.
  cover_src: (name: string) => Promise<string>;
  // Runs whenever the data changed somewhere else; returns the function that stops listening.
  on_change: (listener: () => void) => () => void;
}

// ── Calls ────────────────────────────────────────────────────────────────────

// A call that only reads; any other call announces a change.
export function is_read_only(method: string): boolean {
  return /^(list|get|search|lookup|export)_/.test(method);
}
