// The bundled source plugins as the plugin host knows them: their names, versions and settings. The store and the page
// each start their own side of a plugin from the same manifest, so this file imports nothing either would not.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { AppInfo, PluginManifest } from "@x-tech-laboratories/x-libs/plugins";

import package_json from "../../../package.json" with { type: "json" };
import { default_stremio_web } from "./stremio/links.ts";

// ── App ──────────────────────────────────────────────────────────────────────

export const app_info: AppInfo = { id: "x-media-tracker", version: package_json.version };

// The setting holding every plugin's on or off and its own settings, synced like any other.
export const plugins_setting = "plugins";

// ── Sources ──────────────────────────────────────────────────────────────────

const auto_import = (service: string) => ({
  key: "auto_import",
  label: "Import automatically",
  hint: `Imports from ${service} on the schedule under Settings → Sources → Automatic imports.`,
  type: "switch" as const,
  default: false,
});

export const trakt_manifest: PluginManifest = {
  id: "x-media-tracker.trakt",
  name: "Trakt",
  version: app_info.version,
  app: app_info.id,
  description: "Imports watched movies and every episode's history from Trakt, archives everything Trakt holds, and compares Trakt's history with the library.",
  settings: [auto_import("Trakt")],
};

export const stremio_manifest: PluginManifest = {
  id: "x-media-tracker.stremio",
  name: "Stremio",
  version: app_info.version,
  app: app_info.id,
  description: "Imports the Stremio library: watched movies, and each show up to the episode last played.",
  settings: [
    auto_import("Stremio"),
    {
      key: "web_address",
      label: "Stremio Web address",
      hint: "The Stremio Web instance a title's Stremio Web button opens, such as a self-hosted one.",
      type: "text",
      default: default_stremio_web,
      placeholder: default_stremio_web,
    },
  ],
};

export const source_manifests = [trakt_manifest, stremio_manifest];
