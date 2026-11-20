// TMDB as a bundled plugin, providing the movies and shows catalogue with the key from its own settings, and saying so
// while none is set.

// ── Imports ──────────────────────────────────────────────────────────────────

import { define_plugin } from "@x-tech-laboratories/x-libs/plugins";

import type { MediaPlugin, MediaPluginApi } from "../plugins/host.ts";
import { tmdb_manifest } from "./manifests.ts";
import { create_tmdb, type Tmdb } from "./tmdb.ts";

// ── Shapes ───────────────────────────────────────────────────────────────────

// A movies and shows catalogue as its plugin provides it to the library.
export interface TitleCatalog {
  source: "tmdb";
  // Why it cannot be asked now, such as a missing key; "" when it can.
  missing: string;
  client: Tmdb | null;
}

// ── Plugins ──────────────────────────────────────────────────────────────────

export const tmdb_plugin = define_plugin<MediaPluginApi>({
  ...tmdb_manifest,
  start: (context) => {
    const key = String(context.settings().api_key ?? "").trim();
    const catalog: TitleCatalog = key ? { source: "tmdb", missing: "", client: create_tmdb(key) } : { source: "tmdb", missing: "Set a TMDB API key in Settings first.", client: null };
    context.provide("title_catalog", "tmdb", catalog);
  },
});

export const title_catalog_plugins: MediaPlugin[] = [tmdb_plugin];
