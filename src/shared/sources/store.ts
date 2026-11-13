// The sources the library imports from, each a bundled plugin providing an importer, and the schedule that runs the
// ones set to import automatically. The schedule's last run syncs, so the server and a desktop app do not both run it.

// ── Imports ──────────────────────────────────────────────────────────────────

import { define_plugin } from "@x-tech-laboratories/x-libs/plugins";
import type { MethodSpec } from "@x-tech-laboratories/x-libs/api_spec";
import type { SqlDatabase } from "@x-tech-laboratories/x-libs/sql";

import { text } from "../api_schemas.ts";
import { define_feature } from "../feature.ts";
import type { ImportReport } from "../library/store.ts";
import { settings_feature } from "../settings.ts";
import { open_source_host, type SourceApi, type SourcePlugin } from "./host.ts";
import { stremio_manifest, trakt_manifest } from "./manifests.ts";
import { import_stremio, is_stremio_ready } from "./stremio/store.ts";
import { import_trakt, is_trakt_ready } from "./trakt/store.ts";

// ── Plugins ──────────────────────────────────────────────────────────────────

export const trakt_source = define_plugin<SourceApi>({
  ...trakt_manifest,
  start: (context) =>
    context.provide("importer", "trakt", { label: "Trakt", is_ready: is_trakt_ready, run: import_trakt, imports_automatically: () => context.settings().auto_import === true }),
});

export const stremio_source = define_plugin<SourceApi>({
  ...stremio_manifest,
  start: (context) =>
    context.provide("importer", "stremio", { label: "Stremio", is_ready: is_stremio_ready, run: import_stremio, imports_automatically: () => context.settings().auto_import === true }),
});

export const source_plugins: SourcePlugin[] = [trakt_source, stremio_source];

// ── Shapes ───────────────────────────────────────────────────────────────────

export interface SourceSummary {
  // The importer's id, such as "trakt".
  id: string;
  plugin_id: string;
  label: string;
  ready: boolean;
  imports_automatically: boolean;
}

export interface AutoImportRun {
  ran_at: string;
  // One line per source, such as "Trakt: 2 added, 40 updated" or "Stremio: Sign in to Stremio first."
  result: string;
}

export const sources_setting_defaults = {
  // The fewest hours between automatic imports; the check runs hourly.
  "sources.auto_import_hours": 6,
  // When the automatic imports last ran, as an ISO timestamp, and what they did.
  "sources.last_auto_import": "",
  "sources.last_auto_result": "",
};

const hour_in_milliseconds = 60 * 60 * 1000;

function report_line(label: string, report: ImportReport): string {
  return `${label}: ${report.added} added, ${report.updated} updated`;
}

async function running_importers(database: SqlDatabase) {
  return (await open_source_host(database, source_plugins)).providers("importer");
}

// ── Feature ──────────────────────────────────────────────────────────────────

export const sources_feature = define_feature({
  id: "sources",
  migrations: [],
  tables: [],
  setting_defaults: sources_setting_defaults,
  methods: {
    list_sources: async (database: SqlDatabase): Promise<SourceSummary[]> =>
      (await running_importers(database)).map((provided) => ({
        id: provided.id,
        plugin_id: provided.plugin_id,
        label: provided.value.label,
        ready: provided.value.is_ready(database),
        imports_automatically: provided.value.imports_automatically(),
      })),

    run_source_import: async (database: SqlDatabase, source: string): Promise<ImportReport> => {
      const importer = (await running_importers(database)).find((provided) => provided.id === source);
      if (!importer) throw new Error(`No source named ${source} is on.`);
      return importer.value.run(database);
    },

    // Runs every source set to import automatically once enough hours have passed; one failing leaves the others, and a
    // failure still counts as a run, so a broken source is not retried every hour.
    run_due_imports: async (database: SqlDatabase): Promise<AutoImportRun | null> => {
      const values = { ...sources_setting_defaults, ...settings_feature.methods.get_settings(database) };
      const hours = Math.max(1, Number(values["sources.auto_import_hours"]) || sources_setting_defaults["sources.auto_import_hours"]);
      const last = Date.parse(String(values["sources.last_auto_import"]));
      if (Number.isFinite(last) && Date.now() - last < hours * hour_in_milliseconds) return null;

      const due = (await running_importers(database)).filter((provided) => provided.value.imports_automatically());
      if (due.length === 0) return null;
      const lines: string[] = [];
      for (const provided of due) {
        try {
          lines.push(report_line(provided.value.label, await provided.value.run(database)));
        } catch (error) {
          lines.push(`${provided.value.label}: ${(error as Error).message}`);
        }
      }
      const run = { ran_at: new Date().toISOString(), result: lines.join("; ") };
      settings_feature.methods.set_setting(database, "sources.last_auto_import", run.ran_at);
      settings_feature.methods.set_setting(database, "sources.last_auto_result", run.result);
      return run;
    },
  },
  api: {
    list_sources: {
      description: "Lists the sources that are on, such as Trakt and Stremio: whether each is signed in and imports automatically.",
      params: [],
    },
    run_source_import: {
      description: "Imports from one source now; adds new titles and merges ones already here, never removing any.",
      params: [{ name: "source", schema: { ...text("The source's id from list_sources."), enum: ["trakt", "stremio"] } }],
    },
    run_due_imports: {
      description: "Runs the automatic imports when the hours set under Settings have passed since the last; gives what each did, or null when none were due.",
      params: [],
    },
  } satisfies Record<string, MethodSpec>,
});
