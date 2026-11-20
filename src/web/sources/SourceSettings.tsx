// The sources' part of Movies & Series' settings: a row for each source plugin, whose dialog signs in and imports, and
// how often the automatic imports run.

// ── Imports ──────────────────────────────────────────────────────────────────

import { NumberField } from "@x-tech-laboratories/x-libs/web/react/controls";
import { SettingRow, type SettingsSection } from "@x-tech-laboratories/x-libs/web/react/layout";

import type { FeatureSettingsProps } from "../features.tsx";
import { PluginRows } from "../plugins.tsx";
import { source_manifests } from "../../shared/sources/manifests.ts";

// ── Parts ────────────────────────────────────────────────────────────────────

export function SourcePluginRows() {
  return <PluginRows manifests={source_manifests} />;
}

function AutomaticImports({ settings, set_setting }: FeatureSettingsProps) {
  const ran_at = String(settings["sources.last_auto_import"] ?? "");
  const last_run = ran_at ? `Last ran ${new Date(ran_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" })}: ${String(settings["sources.last_auto_result"])}` : "Not run yet.";
  return (
    <SettingRow label="Hours between imports" hint={last_run}>
      <NumberField label="Hours between imports" bare unit="hours" min={1} max={168} value={Number(settings["sources.auto_import_hours"])} on_change={(hours) => void set_setting("sources.auto_import_hours", hours ?? 6)} />
    </SettingRow>
  );
}

// ── Sections ─────────────────────────────────────────────────────────────────

export function automatic_imports_section(props: FeatureSettingsProps): SettingsSection {
  return {
    id: "automatic-imports",
    heading: "Automatic imports",
    hint: "Sources set to import automatically in their dialog under Sources run on this schedule, on the server and the desktop app.",
    content: <AutomaticImports {...props} />,
  };
}
