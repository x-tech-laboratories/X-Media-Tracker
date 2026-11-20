// Settings every device shares, kept as JSON values by key so each feature can add its own.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { SqlDatabase } from "@x-tech-laboratories/x-libs/sql";

import { text } from "./api_schemas.ts";
import { define_feature } from "./feature.ts";
import { read_settings_file, settings_file, type SettingsFile } from "./transfer.ts";

// ── Settings ─────────────────────────────────────────────────────────────────

export type Settings = Record<string, unknown>;

function stored_settings(database: SqlDatabase): Settings {
  const rows = database.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  return Object.fromEntries(rows.map((row) => [row.key, JSON.parse(row.value)]));
}

function write_setting(database: SqlDatabase, key: string, value: unknown): void {
  database.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(key, JSON.stringify(value));
}

// The keys holding another service's key or token, which every feature names and the store hands over once it has them all.
let secret_keys: string[] = [];

export function know_secret_settings(keys: string[]): void {
  secret_keys = keys;
}

export function without_secret_settings(settings: Settings): Settings {
  return Object.fromEntries(Object.entries(settings).filter(([key]) => !secret_keys.includes(key)));
}

// ── Store ────────────────────────────────────────────────────────────────────

export const settings_feature = define_feature({
  id: "settings",
  migrations: [`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`],
  tables: [{ name: "settings", key_columns: ["key"] }],
  methods: {
    // Only the values set; the page lays them over the defaults.
    get_settings: (database: SqlDatabase): Settings => stored_settings(database),
    set_setting: (database: SqlDatabase, key: string, value: unknown): void => write_setting(database, key, value),

    export_settings: (database: SqlDatabase, include_secrets: boolean): SettingsFile => {
      const settings = stored_settings(database);
      return settings_file(include_secrets ? settings : without_secret_settings(settings));
    },

    // A key the file leaves out keeps its value, so keys and tokens set here stay when the file has none.
    import_settings: (database: SqlDatabase, file: unknown): { changed: number; unchanged: number } => {
      const settings = read_settings_file(file);
      const stored = stored_settings(database);
      let changed = 0;
      for (const [key, value] of Object.entries(settings)) {
        if (!key || value === undefined || JSON.stringify(stored[key]) === JSON.stringify(value)) continue;
        write_setting(database, key, value);
        changed += 1;
      }
      return { changed, unchanged: Object.keys(settings).length - changed };
    },
  },
  api: {
    get_settings: {
      description: "The settings stored, by key, such as library.poster_size or history.keep_days; a key missing here has its default.",
      params: [],
    },
    set_setting: {
      description: "Sets one setting by key to any JSON value.",
      params: [{ name: "key", schema: text("The setting's key, such as library.poster_size.") }, { name: "value", schema: { description: "The new value." } }],
    },
    export_settings: {
      description:
        "Gives the settings stored, by key, as an X-Media-Tracker settings export that import_settings reads back. Keys and tokens for other services are left out unless include_secrets is true; " +
        "through MCP they are always left out.",
      params: [{ name: "include_secrets", schema: { type: "boolean", description: "Whether to include the keys and tokens for other services, such as the TMDB key." } }],
    },
    import_settings: {
      description: "Sets every setting a settings export holds, keeping the value of any key it leaves out. Answers how many settings changed and how many already had the file's value.",
      params: [{ name: "file", schema: { description: "The settings export, as an object or its text." } }],
    },
  },
});
