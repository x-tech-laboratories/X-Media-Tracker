// The store's side of the plugins: an X-Libs plugin host whose plugins provide importers and catalogues, with every
// plugin's on or off and settings kept in the synced settings, where the page's side of the same plugins reads them too.

// ── Imports ──────────────────────────────────────────────────────────────────

import { create_plugin_host, type Plugin, type PluginHost, type PluginManifest, type PluginRecords, type PluginStorage } from "@x-tech-laboratories/x-libs/plugins";
import { in_transaction, type SqlDatabase } from "@x-tech-laboratories/x-libs/sql";

import type { BookCatalog } from "../books/catalog.ts";
import type { GameCatalog } from "../games/catalog.ts";
import type { TitleCatalog } from "../library/plugins.ts";
import type { ImportReport } from "../library/store.ts";
import { settings_feature } from "../settings.ts";
import { app_info, plugins_setting } from "./app.ts";

// ── Api ──────────────────────────────────────────────────────────────────────

export interface Importer {
  label: string;
  // Whether it is signed in and can import now.
  is_ready: (database: SqlDatabase) => boolean;
  run: (database: SqlDatabase) => Promise<ImportReport>;
  // Whether the user turned on its automatic imports.
  imports_automatically: () => boolean;
}

export interface MediaPluginApi {
  providers: { importer: Importer; game_catalog: GameCatalog; book_catalog: BookCatalog; title_catalog: TitleCatalog };
}

export type MediaPlugin = Plugin<MediaPluginApi>;

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

// Moves settings kept before their service was a plugin into that plugin's settings, once: a value set there already wins.
export function move_settings_into_plugins(database: SqlDatabase, moves: Record<string, { plugin: string; field: string }>): void {
  const stored = settings_feature.methods.get_settings(database);
  const found = Object.keys(moves).filter((key) => key in stored);
  if (found.length === 0) return;
  const records = { ...plugin_records(database) };
  for (const key of found) {
    const { plugin, field } = moves[key]!;
    const value = stored[key];
    const settings = { ...records[plugin]?.settings };
    if (typeof value === "string" && value.trim() !== "" && !settings[field]) records[plugin] = { ...records[plugin], settings: { ...settings, [field]: value.trim() } };
  }
  in_transaction(database, () => {
    settings_feature.methods.set_setting(database, plugins_setting, records);
    for (const key of found) database.prepare("DELETE FROM settings WHERE key = ?").run(key);
  });
}

// The host's own rule for a plugin with no saved choice: on unless its manifest says otherwise.
export function is_switched_on(database: SqlDatabase, manifest: PluginManifest): boolean {
  return plugin_records(database)[manifest.id]?.enabled ?? manifest.enabled_by_default ?? true;
}

export function require_switched_on(database: SqlDatabase, manifest: PluginManifest): void {
  if (!is_switched_on(database, manifest)) throw new Error(`The ${manifest.name} plugin is off; turn it on in Settings.`);
}

// ── Host ─────────────────────────────────────────────────────────────────────

// Made afresh for each use, so a plugin turned on or off on any device, or given a new key, holds at once.
export async function open_plugin_host(database: SqlDatabase, plugins: MediaPlugin[]): Promise<PluginHost<MediaPluginApi>> {
  const host = create_plugin_host<MediaPluginApi>({ app: app_info, storage: settings_storage(database), on_error: (plugin_id, error) => console.warn(`plugin ${plugin_id}:`, error) });
  for (const plugin of plugins) await host.add(plugin);
  await host.start();
  return host;
}
