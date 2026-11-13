// The page's side of the source plugins: each fills the Import page with its own panel. On or off and each plugin's
// settings are the same synced records the store's side reads, so a source turned off here stops importing everywhere.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useEffect, useState, type ComponentType } from "react";
import { create_plugin_host, define_plugin, type PluginHost, type PluginRecords } from "@x-tech-laboratories/x-libs/plugins";

import { calls } from "../api.ts";
import { app_info, plugins_setting, stremio_manifest, trakt_manifest } from "../../shared/sources/manifests.ts";
import { StremioPanel } from "./StremioPanel.tsx";
import { TraktPanel } from "./TraktPanel.tsx";

// ── Api ──────────────────────────────────────────────────────────────────────

export interface PageSourceApi {
  slots: { import_panel: ComponentType<Record<string, never>> };
}

const trakt_page = define_plugin<PageSourceApi>({ ...trakt_manifest, start: (context) => context.fill_slot("import_panel", TraktPanel) });

const stremio_page = define_plugin<PageSourceApi>({ ...stremio_manifest, start: (context) => context.fill_slot("import_panel", StremioPanel) });

// ── Host ─────────────────────────────────────────────────────────────────────

let started: Promise<PluginHost<PageSourceApi>> | null = null;

// Started once, after sign-in, since its records come from the server.
export function start_page_plugins(): Promise<PluginHost<PageSourceApi>> {
  started ??= (async () => {
    const host = create_plugin_host<PageSourceApi>({
      app: app_info,
      storage: {
        read: async () => (await calls().get_settings())[plugins_setting] as PluginRecords | undefined,
        write: (records) => calls().set_setting(plugins_setting, records),
      },
      on_error: (plugin_id, error) => console.warn(`plugin ${plugin_id}:`, error),
    });
    await host.add(trakt_page);
    await host.add(stremio_page);
    await host.start();
    return host;
  })();
  return started;
}

// The started host, or null while it starts.
export function use_page_plugins(): PluginHost<PageSourceApi> | null {
  const [host, set_host] = useState<PluginHost<PageSourceApi> | null>(null);
  useEffect(() => void start_page_plugins().then(set_host), []);
  return host;
}

// For tests, which each start from nothing.
export function forget_page_plugins(): void {
  started = null;
}
