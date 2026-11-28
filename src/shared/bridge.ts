// The bridges the desktop app's main process and preload use, and the web server's call dispatch.

// ── Imports ──────────────────────────────────────────────────────────────────

import { define_bridge } from "@x-tech-laboratories/x-libs/electron/bridge";
import { backup_method_names, type BackupMethods } from "@x-tech-laboratories/x-libs/backup_protocol";
import { certificate_method_names, type CertificateMethods } from "@x-tech-laboratories/x-libs/certificate_protocol";
import { connection_method_names, type ConnectionMethods } from "@x-tech-laboratories/x-libs/connection_protocol";
import { peer_listening_method_names, type PeerListeningMethods } from "@x-tech-laboratories/x-libs/sync_protocol";
import { define_events } from "@x-tech-laboratories/x-libs/electron/events";

import { desktop_method_names, type DesktopMethods } from "./desktop.ts";
import {
  backups_api_name,
  certificates_api_name,
  connections_api_name,
  desktop_api_name,
  peer_listening_api_name,
  device_api_name,
  device_method_names,
  events_api_name,
  launcher_method_names,
  launchers_api_name,
  media_api_name,
  plugin_file_method_names,
  plugin_files_api_name,
  steam_file_method_names,
  steam_files_api_name,
  type DeviceMethods,
  type LauncherMethods,
  type MediaEvents,
  type PluginFileMethods,
  type SteamFileMethods,
} from "./page_api.ts";
import { method_names, type MediaMethods } from "./store.ts";

// ── Bridges ──────────────────────────────────────────────────────────────────

export const media_bridge = define_bridge<MediaMethods>(media_api_name, method_names);

export const device_bridge = define_bridge<DeviceMethods>(device_api_name, device_method_names);

// Server certificates the user chose to trust, such as a home sync server's self-signed one.
export const certificate_bridge = define_bridge<CertificateMethods>(certificates_api_name, certificate_method_names);

export const steam_files_bridge = define_bridge<SteamFileMethods>(steam_files_api_name, steam_file_method_names);

export const launchers_bridge = define_bridge<LauncherMethods>(launchers_api_name, launcher_method_names);
export const plugin_files_bridge = define_bridge<PluginFileMethods>(plugin_files_api_name, plugin_file_method_names);

// Backups of the database the window works on: this computer's, or a server's, which only an admin reaches.
export const backup_bridge = define_bridge<BackupMethods>(backups_api_name, backup_method_names);

// The desktop app's own settings and quitting it completely.
export const desktop_bridge = define_bridge<DesktopMethods>(desktop_api_name, desktop_method_names);

// The daemons the desktop app can work on: this computer's, or a server signed in to as this device.
export const connection_bridge = define_bridge<ConnectionMethods>(connections_api_name, connection_method_names);

// Whether other devices may reach this computer's sync, and on which port.
export const peer_listening_bridge = define_bridge<PeerListeningMethods>(peer_listening_api_name, peer_listening_method_names);

export const media_events = define_events<MediaEvents>(events_api_name);
