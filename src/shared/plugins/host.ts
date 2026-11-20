// The store's side of the plugins: an X-Libs plugin host whose plugins provide importers and catalogues, with every
// plugin's on or off and settings kept in the synced settings, where the page's side of the same plugins reads them too.

// ── Imports ──────────────────────────────────────────────────────────────────

import { create_plugin_host, type Plugin, type PluginHost, type PluginManifest, type PluginRecords, type PluginStorage, type SettingValues } from "@x-tech-laboratories/x-libs/plugins";
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

// Where a setting kept before its service was a plugin goes: a field of that plugin's settings, as text or, for an old
// number of hours between imports, as its automatic import switch; null drops it.
export type SettingMove = { plugin: string; field: string; as?: "switch" } | null;

// Moves settings kept before their service was a plugin into that plugin's settings, once: a value set there already wins.
export function move_settings_into_plugins(database: SqlDatabase, moves: Record<string, SettingMove>): void {
  const stored = settings_feature.methods.get_settings(database);
  const found = Object.keys(moves).filter((key) => key in stored);
  if (found.length === 0) return;
  const records = { ...plugin_records(database) };
  for (const key of found) {
    const move = moves[key];
    if (!move) continue;
    const old = stored[key];
    const value = move.as === "switch" ? Number(old) > 0 : typeof old === "string" ? old.trim() : "";
    const settings = { ...records[move.plugin]?.settings };
    if (value !== "" && value !== false && !settings[move.field]) records[move.plugin] = { ...records[move.plugin], settings: { ...settings, [move.field]: value } };
  }
  in_transaction(database, () => {
    settings_feature.methods.set_setting(database, plugins_setting, records);
    for (const key of found) database.prepare("DELETE FROM settings WHERE key = ?").run(key);
  });
}

// A plugin's settings as stored, each missing one at its manifest's default.
export function plugin_settings(database: SqlDatabase, manifest: PluginManifest): SettingValues {
  const stored = plugin_records(database)[manifest.id]?.settings ?? {};
  return Object.fromEntries((manifest.settings ?? []).map((field) => [field.key, stored[field.key] ?? field.default]));
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
