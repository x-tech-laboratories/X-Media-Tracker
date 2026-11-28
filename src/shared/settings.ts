// Settings every device shares, kept as JSON values by key in the X-Libs settings store, each feature declaring its own keys.

// ── Imports ──────────────────────────────────────────────────────────────────

import { hide_secrets, keep_secrets, type PluginRecords } from "@x-tech-laboratories/x-libs/plugins";
import { create_settings_store, settings_of, type SettingSpec } from "@x-tech-laboratories/x-libs/settings";

import { define_feature } from "./feature.ts";
import { plugins_setting } from "./plugins/app.ts";
import { plugin_manifests } from "./plugins/manifests.ts";

// ── Settings ─────────────────────────────────────────────────────────────────

export type { Settings } from "@x-tech-laboratories/x-libs/settings";

// A feature's settings from its defaults, the keys holding another service's key or token marked secret.
export function feature_settings(defaults: Record<string, unknown>, secret_keys: readonly string[] = []): Record<string, SettingSpec> {
  const specs = settings_of(defaults);
  for (const key of secret_keys) specs[key] = { ...specs[key], secret: true };
  return specs;
}

function records_of(value: unknown): PluginRecords {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as PluginRecords) : {};
}

// Each plugin's keys hidden from the page and other programs, and kept when written back hidden.
const plugin_settings: Record<string, SettingSpec> = {
  [plugins_setting]: {
    hide: (value) => hide_secrets(plugin_manifests, records_of(value)),
    keep: (stored, incoming) => keep_secrets(plugin_manifests, records_of(stored), records_of(incoming)),
  },
};

// ── Store ────────────────────────────────────────────────────────────────────

// The settings feature over every other feature's settings, so they share one table and one set of calls.
export function create_settings_feature(features: readonly { settings?: Record<string, SettingSpec> }[]) {
  const store = create_settings_store([plugin_settings, ...features.map((feature) => feature.settings ?? {})], {
    app: { id: "x-media-tracker", name: "X-Media-Tracker" },
    descriptions: {
      get_settings: "Every setting by key, such as library.poster_size or history.keep_days, the ones never set at their defaults, with keys and tokens for other services hidden.",
      export_settings:
        "Gives the settings set, by key, as an X-Media-Tracker settings export that import_settings reads back. Keys and tokens for other services are left out unless include_secrets is true; through MCP they are always left out.",
    },
    key_example: "library.poster_size",
  });
  const feature = define_feature({ id: store.id, migrations: store.migrations, tables: store.tables, methods: { ...store.methods }, api: store.api });
  return { store, feature };
}
