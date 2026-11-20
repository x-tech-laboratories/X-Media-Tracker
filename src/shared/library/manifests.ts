// The TMDB plugin as the plugin host knows it: its name, version and key, kept secret. The store and the page each start
// their own side of it from this manifest.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { PluginManifest } from "@x-tech-laboratories/x-libs/plugins";

import { app_info } from "../plugins/app.ts";

// ── Catalogue ────────────────────────────────────────────────────────────────

export const tmdb_manifest: PluginManifest = {
  id: "x-media-tracker.tmdb",
  name: "TMDB",
  version: app_info.version,
  app: app_info.id,
  description: "The Movie Database: search, posters, episode lists and details for movies and shows. Movies & Series needs it.",
  settings: [{ key: "api_key", label: "API key", hint: "A free v3 key from themoviedb.org/settings/api.", type: "text", default: "", placeholder: "Paste your key", secret: true }],
};

export const title_catalog_manifests = [tmdb_manifest];

// The library setting TMDB's key was kept in before it was a plugin, and the plugin field it moves to.
export const moved_library_keys: Record<string, { plugin: string; field: string }> = {
  "library.tmdb_api_key": { plugin: tmdb_manifest.id, field: "api_key" },
};
