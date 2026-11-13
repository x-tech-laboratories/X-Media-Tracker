// The store's side of the source plugins: an X-Libs plugin host whose plugins provide importers, with every plugin's
// on or off and settings kept in the synced settings, where the page's side of the same plugins reads them too.

// ── Imports ──────────────────────────────────────────────────────────────────

import { create_plugin_host, type Plugin, type PluginHost, type PluginManifest, type PluginRecords, type PluginStorage } from "@x-tech-laboratories/x-libs/plugins";
import type { SqlDatabase } from "@x-tech-laboratories/x-libs/sql";

import type { ImportReport } from "../library/store.ts";
import { settings_feature } from "../settings.ts";
import { app_info, plugins_setting } from "./manifests.ts";

// ── Api ──────────────────────────────────────────────────────────────────────

export interface Importer {
  label: string;
  // Whether it is signed in and can import now.
  is_ready: (database: SqlDatabase) => boolean;
  run: (database: SqlDatabase) => Promise<ImportReport>;
  // Whether the user turned on its automatic imports.
  imports_automatically: () => boolean;
}

export interface SourceApi {
  providers: { importer: Importer };
}

export type SourcePlugin = Plugin<SourceApi>;

// ── Storage ──────────────────────────────────────────────────────────────────

export function plugin_records(database: SqlDatabase): PluginRecords {
  const saved = settings_feature.methods.get_settings(database)[plugins_setting];
  return saved && typeof saved === "object" && !Array.isArray(saved) ? (saved as PluginRecords) : {};
}

function settings_storage(database: SqlDatabase): PluginStorage {
  return {
    read: () => plugin_records(database),
    write: (records) => settings_feature.methods.set_setting(database, plugins_setting, records),
  };
}

// The host's own rule for a plugin with no saved choice: on unless its manifest says otherwise.
export function is_switched_on(database: SqlDatabase, manifest: PluginManifest): boolean {
  return plugin_records(database)[manifest.id]?.enabled ?? manifest.enabled_by_default ?? true;
}

export function require_switched_on(database: SqlDatabase, manifest: PluginManifest): void {
  if (!is_switched_on(database, manifest)) throw new Error(`The ${manifest.name} plugin is off; turn it on under Settings → Sources → Plugins.`);
}

// ── Host ─────────────────────────────────────────────────────────────────────

// Made afresh for each use, so a plugin turned on or off on any device holds at once.
export async function open_source_host(database: SqlDatabase, plugins: SourcePlugin[]): Promise<PluginHost<SourceApi>> {
  const host = create_plugin_host<SourceApi>({ app: app_info, storage: settings_storage(database), on_error: (plugin_id, error) => console.warn(`plugin ${plugin_id}:`, error) });
  for (const plugin of plugins) await host.add(plugin);
  await host.start();
  return host;
}
