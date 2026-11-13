// The Import page: each source plugin that is on draws its own panel, under what the automatic imports last did.

// ── Imports ──────────────────────────────────────────────────────────────────

import { PageHeading } from "@x-tech-laboratories/x-libs/web/react/layout";
import { PluginSettings, PluginSlot } from "@x-tech-laboratories/x-libs/web/react/plugins";
import { Empty, Skeleton } from "@x-tech-laboratories/x-libs/web/react/states";

import { use_settings } from "../api.ts";
import { use_page_plugins } from "./plugins.tsx";

// ── Page ─────────────────────────────────────────────────────────────────────

function LastAutomaticImport() {
  const settings = use_settings();
  const ran_at = String(settings.data?.["sources.last_auto_import"] ?? "");
  if (!ran_at) return null;
  return (
    <p className="source-hint">
      Automatic imports last ran {new Date(ran_at).toLocaleString()}: {String(settings.data?.["sources.last_auto_result"] ?? "")}
    </p>
  );
}

export function ImportTab() {
  const host = use_page_plugins();
  return (
    <div className="import-page">
      <PageHeading title="Import" subtitle="One way and additive: imports add titles and merge ones already here, never removing any." />
      <LastAutomaticImport />
      {host ? (
        <PluginSlot host={host} name="import_panel" props={{}} empty={<Empty title="Every source is off." hint={<a href="#/settings">Turn one on under Settings → Plugins</a>} />} />
      ) : (
        <Skeleton lines={4} />
      )}
    </div>
  );
}

// The Plugins section of Settings: each source's on or off and its own settings.
export function SourcePluginSettings() {
  const host = use_page_plugins();
  return host ? <PluginSettings host={host} /> : <Skeleton lines={2} />;
}
