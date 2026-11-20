// X-Media-Tracker as the plugin host knows it, and the setting every plugin's on or off and settings are kept in; the
// store and the page both read this file, so it imports nothing either would not.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { AppInfo, SettingField } from "@x-tech-laboratories/x-libs/plugins";

import package_json from "../../../package.json" with { type: "json" };

// ── App ──────────────────────────────────────────────────────────────────────

export const app_info: AppInfo = { id: "x-media-tracker", version: package_json.version };

// The setting holding every plugin's on or off and its own settings, synced like any other.
export const plugins_setting = "plugins";

// The switch that puts a source on the one schedule every automatic import runs on.
export function auto_import_field(service: string): SettingField {
  return {
    key: "auto_import",
    label: "Import automatically",
    hint: `Imports from ${service} on the schedule under Settings → Movies & Series → Automatic imports.`,
    type: "switch",
    default: false,
  };
}
