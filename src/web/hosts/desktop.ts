// The desktop app's page: the preload has put the main process's calls on the window, which go to this computer's
// daemon or to the X-Media-Tracker server that Settings → Connections chose.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { Client } from "@x-tech-laboratories/x-libs/electron/bridge";
import type { CertificateClient } from "@x-tech-laboratories/x-libs/certificate_protocol";
import type { EventsClient } from "@x-tech-laboratories/x-libs/electron/events";
import type { BackupClient } from "@x-tech-laboratories/x-libs/backup_protocol";
import { LOCAL_CONNECTION_ID, type ConnectionClient } from "@x-tech-laboratories/x-libs/connection_protocol";
import type { PeerListeningClient } from "@x-tech-laboratories/x-libs/sync_protocol";

import type { DesktopMethods } from "../../shared/desktop.ts";
import {
  backups_api_name,
  certificates_api_name,
  connections_api_name,
  desktop_api_name,
  peer_listening_api_name,
  cover_scheme,
  device_api_name,
  events_api_name,
  launchers_api_name,
  media_api_name,
  plugin_files_api_name,
  steam_files_api_name,
  type DeviceMethods,
  type LauncherMethods,
  type MediaEvents,
  type PageApi,
  type PluginFileMethods,
  type SteamFileMethods,
} from "../../shared/page_api.ts";
import type { MediaMethods } from "../../shared/store.ts";

// ── Api ──────────────────────────────────────────────────────────────────────

type DesktopWindow = Record<string, unknown>;

export function is_desktop(): boolean {
  return media_api_name in window;
}

// The window starts again whenever another daemon is chosen, so where it runs is read once here.
export async function desktop_api(): Promise<PageApi> {
  const desktop = window as unknown as DesktopWindow;
  const events = desktop[events_api_name] as EventsClient<MediaEvents>;
  const connections = desktop[connections_api_name] as ConnectionClient;
  const is_here = (await connections.list_connections()).current === LOCAL_CONNECTION_ID;
  return {
    host: "desktop",
    calls: desktop[media_api_name] as Client<MediaMethods>,
    // Sync and letting other devices connect belong to this computer's own daemon, so they show only while it is in use.
    device: is_here ? (desktop[device_api_name] as Client<DeviceMethods>) : null,
    ...(is_here ? { peer_listening: desktop[peer_listening_api_name] as PeerListeningClient } : {}),
    backups: desktop[backups_api_name] as BackupClient,
    certificates: desktop[certificates_api_name] as CertificateClient,
    steam_files: desktop[steam_files_api_name] as Client<SteamFileMethods>,
    launchers: desktop[launchers_api_name] as Client<LauncherMethods>,
    plugin_files: desktop[plugin_files_api_name] as Client<PluginFileMethods>,
    connections,
    desktop: desktop[desktop_api_name] as Client<DesktopMethods>,
    cover_src: async (name) => `${cover_scheme}://${name}`,
    on_change: (listener) => events.on("changed", listener),
  };
}
