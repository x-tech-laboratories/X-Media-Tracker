// Stremio as a source: signing in for an auth key and importing its library.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { SqlDatabase } from "@x-tech-laboratories/x-libs/sql";

import { define_feature } from "../../feature.ts";
import { apply_import } from "../../library/importing.ts";
import type { ImportReport } from "../../library/store.ts";
import { settings_feature } from "../../settings.ts";
import { require_switched_on } from "../host.ts";
import { stremio_manifest } from "../manifests.ts";
import { stremio_api } from "./api.ts";
import { read_stremio_library, stremio_sign_in } from "./client.ts";
import { items_from_stremio } from "./mapping.ts";
import { stremio_secret_settings, stremio_setting_defaults } from "./settings.ts";

// ── Settings ─────────────────────────────────────────────────────────────────

function values_of(database: SqlDatabase): typeof stremio_setting_defaults {
  return { ...stremio_setting_defaults, ...settings_feature.methods.get_settings(database) } as typeof stremio_setting_defaults;
}

export function is_stremio_ready(database: SqlDatabase): boolean {
  return values_of(database)["stremio.auth_key"] !== "";
}

export async function import_stremio(database: SqlDatabase): Promise<ImportReport> {
  require_switched_on(database, stremio_manifest);
  const auth_key = values_of(database)["stremio.auth_key"];
  if (!auth_key) throw new Error("Sign in to Stremio first.");
  return apply_import(database, items_from_stremio(await read_stremio_library(auth_key)));
}

// ── Feature ──────────────────────────────────────────────────────────────────

export const stremio_feature = define_feature({
  id: "stremio",
  migrations: [],
  tables: [],
  setting_defaults: stremio_setting_defaults,
  secret_settings: stremio_secret_settings,
  methods: {
    get_stremio_status: (database: SqlDatabase): { signed_in: boolean; email: string } => {
      const values = values_of(database);
      return { signed_in: values["stremio.auth_key"] !== "", email: values["stremio.email"] };
    },
    sign_in_stremio: async (database: SqlDatabase, email: string, password: string): Promise<void> => {
      require_switched_on(database, stremio_manifest);
      const auth_key = await stremio_sign_in(email, password);
      settings_feature.methods.set_setting(database, "stremio.auth_key", auth_key);
      settings_feature.methods.set_setting(database, "stremio.email", email.trim());
    },
    sign_out_stremio: (database: SqlDatabase): void => {
      settings_feature.methods.set_setting(database, "stremio.auth_key", "");
      settings_feature.methods.set_setting(database, "stremio.email", "");
    },
    import_stremio,
  },
  api: stremio_api,
});
