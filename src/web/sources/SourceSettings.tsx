// How often the automatic imports of every source run, shown under Movies & Series' settings, with what the last run did.

// ── Imports ──────────────────────────────────────────────────────────────────

import { NumberField } from "@x-tech-laboratories/x-libs/web/react/controls";
import { SettingRow, type SettingsSection } from "@x-tech-laboratories/x-libs/web/react/layout";

import type { FeatureSettingsProps } from "../features.tsx";

// ── Parts ────────────────────────────────────────────────────────────────────

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
    hint: "Every source set to import automatically in its dialog, here and under Games, runs on this schedule, on the server and the desktop app.",
    content: <AutomaticImports {...props} />,
  };
}
