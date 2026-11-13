// The sources' part of Settings: each source plugin's on or off and its own settings, the panel of each one that is on
// for signing in and importing, and how often the automatic imports run.

// ── Imports ──────────────────────────────────────────────────────────────────

import { NumberField } from "@x-tech-laboratories/x-libs/web/react/controls";
import { SettingRow, Stack, type SettingsSection } from "@x-tech-laboratories/x-libs/web/react/layout";
import { PluginSettings, PluginSlot } from "@x-tech-laboratories/x-libs/web/react/plugins";
import { Empty, Skeleton } from "@x-tech-laboratories/x-libs/web/react/states";

import type { FeatureSettingsProps } from "../features.tsx";
import { use_page_plugins } from "./plugins.tsx";

// ── Parts ────────────────────────────────────────────────────────────────────

function SourcePluginSettings() {
  const host = use_page_plugins();
  return host ? <PluginSettings host={host} heading={null} /> : <Skeleton lines={2} />;
}

function SourceImports() {
  const host = use_page_plugins();
  if (!host) return <Skeleton lines={4} />;
  return (
    <Stack tight>
      <PluginSlot host={host} name="import_panel" props={{}} empty={<Empty title="Every source is off." hint="Turn one on under Plugins above." />} />
    </Stack>
  );
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

export function source_settings(props: FeatureSettingsProps): SettingsSection[] {
  return [
    { id: "plugins", heading: "Plugins", hint: "Bundled with the app; each runs with its full rights.", content: <SourcePluginSettings /> },
    { id: "import", heading: "Import", hint: "One way and additive: imports add titles and merge ones already here, never removing any.", content: <SourceImports /> },
    {
      id: "automatic-imports",
      heading: "Automatic imports",
      hint: "Sources set to import automatically under Plugins run on this schedule, on the server and the desktop app.",
      content: <AutomaticImports {...props} />,
    },
  ];
}
