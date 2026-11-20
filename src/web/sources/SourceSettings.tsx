// The sources' part of Movies & Series' settings: a row for each source plugin whose dialog holds its on or off, its own
// settings and its panel for signing in and importing, and how often the automatic imports run.

// ── Imports ──────────────────────────────────────────────────────────────────

import { NumberField } from "@x-tech-laboratories/x-libs/web/react/controls";
import { SettingRow, type SettingsSection } from "@x-tech-laboratories/x-libs/web/react/layout";
import { PluginSettings, PluginSlot, use_plugins, type PluginHost } from "@x-tech-laboratories/x-libs/web/react/plugins";
import { Skeleton } from "@x-tech-laboratories/x-libs/web/react/states";

import type { FeatureSettingsProps } from "../features.tsx";
import { SourceRow } from "../settings/rows.tsx";
import { use_page_plugins, type PageSourceApi } from "./plugins.tsx";

// ── Parts ────────────────────────────────────────────────────────────────────

// The host as one plugin sees it, so the shared widgets draw only that plugin's settings and panel.
function only_plugin(host: PluginHost<PageSourceApi>, plugin_id: string): PluginHost<PageSourceApi> {
  return {
    ...host,
    list: () => host.list().filter((status) => status.manifest.id === plugin_id),
    slot: ((name) => host.slot(name).filter((part) => part.plugin_id === plugin_id)) as PluginHost<PageSourceApi>["slot"],
  };
}

export function SourcePluginRows() {
  const host = use_page_plugins();
  if (!host) return <Skeleton lines={2} />;
  return <PluginRows host={host} />;
}

function PluginRows({ host }: { host: PluginHost<PageSourceApi> }) {
  const statuses = use_plugins(host);
  return (
    <>
      {statuses.map(({ manifest, state }) => {
        const one = only_plugin(host, manifest.id);
        return (
          <SourceRow key={manifest.id} name={manifest.name} status={state === "running" ? "On" : state === "off" ? "Off" : "Not running"} about={manifest.description}>
            <PluginSettings host={one} heading={null} />
            <PluginSlot host={one} name="import_panel" props={{}} empty={<p className="source-hint">Turn {manifest.name} on to sign in and import.</p>} />
          </SourceRow>
        );
      })}
    </>
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

export function automatic_imports_section(props: FeatureSettingsProps): SettingsSection {
  return {
    id: "automatic-imports",
    heading: "Automatic imports",
    hint: "Sources set to import automatically in their dialog under Sources run on this schedule, on the server and the desktop app.",
    content: <AutomaticImports {...props} />,
  };
}
