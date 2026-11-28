// The store's side of the plugins: an X-Libs plugin host whose plugins provide importers and catalogues, with every
// plugin's on or off and settings kept in the synced settings, where the page's side of the same plugins reads them too.

// ── Imports ──────────────────────────────────────────────────────────────────

import { create_plugin_host, type Plugin, type PluginHost, type PluginManifest, type PluginRecords, type PluginStorage, type SettingValues } from "@x-tech-laboratories/x-libs/plugins";
import { read_stored_settings, write_setting } from "@x-tech-laboratories/x-libs/settings";
import { in_transaction, type SqlDatabase } from "@x-tech-laboratories/x-libs/sql";

import type { BookCatalog } from "../books/catalog.ts";
import type { BookImportReport } from "../books/store.ts";
import type { ImportedBook } from "../books/storygraph.ts";
import type { IgdbGame } from "../games/igdb_export.ts";
import type { GameImportReport } from "../games/store.ts";
import type { ImportItem } from "../library/importing.ts";
import type { GameCatalog } from "../games/catalog.ts";
import type { TitleCatalog } from "../library/plugins.ts";
import type { ImportReport } from "../library/store.ts";
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

// What the app hands every plugin, so one from the plugins folder can write into the library without reaching into the store.
export interface MediaServices {
  // Movies and shows matched on any id, TMDB asked first for new ones, episodes merged; never removes anything.
  import_titles: (database: SqlDatabase, items: ImportItem[]) => Promise<ImportReport>;
  // Books matched on their ISBN, else their title and author, as a StoryGraph import does.
  import_books: (database: SqlDatabase, books: ImportedBook[]) => BookImportReport;
  // Games matched on their title, as IGDB's data export is.
  import_games: (database: SqlDatabase, games: IgdbGame[]) => GameImportReport;
}

export interface MediaPluginApi {
  providers: { importer: Importer; game_catalog: GameCatalog; book_catalog: BookCatalog; title_catalog: TitleCatalog };
  services: MediaServices;
}

export type MediaPlugin = Plugin<MediaPluginApi>;

// ── Storage ──────────────────────────────────────────────────────────────────

export function plugin_records(database: SqlDatabase): PluginRecords {
  const saved = read_stored_settings(database)[plugins_setting];
  return saved && typeof saved === "object" && !Array.isArray(saved) ? (saved as PluginRecords) : {};
}

function settings_storage(database: SqlDatabase): PluginStorage {
  return {
    read: () => plugin_records(database),
    write: (records) => write_setting(database, plugins_setting, records),
  };
}

// Where a setting kept before its service was a plugin goes: a field of that plugin's settings, as text or, for an old
// number of hours between imports, as its automatic import switch; null drops it.
export type SettingMove = { plugin: string; field: string; as?: "switch" } | null;

// Moves settings kept before their service was a plugin into that plugin's settings, once: a value set there already wins.
export function move_settings_into_plugins(database: SqlDatabase, moves: Record<string, SettingMove>): void {
  const stored = read_stored_settings(database);
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
    write_setting(database, plugins_setting, records);
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

// The services and the plugins from the plugins folder, which the store and the host that loads the folder hand over once.
let services: MediaServices | undefined;
let folder_plugins: MediaPlugin[] = [];

export function know_plugin_services(given: MediaServices): void {
  services = given;
}

export function use_folder_plugins(plugins: MediaPlugin[]): void {
  folder_plugins = plugins;
}

// Made afresh for each use, so a plugin turned on or off on any device, or given a new key, holds at once; the folder's
// plugins join every host after the bundled ones.
export async function open_plugin_host(database: SqlDatabase, plugins: MediaPlugin[]): Promise<PluginHost<MediaPluginApi>> {
  if (!services) throw new Error("The store has not handed over its plugin services yet.");
  const host = create_plugin_host<MediaPluginApi>({ app: app_info, storage: settings_storage(database), services, on_error: (plugin_id, error) => console.warn(`plugin ${plugin_id}:`, error) });
  for (const plugin of [...plugins, ...folder_plugins]) await host.add(plugin);
  await host.start();
  return host;
}
