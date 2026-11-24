// TMDB as a bundled plugin, providing the movies and shows catalogue with the key from its own settings, and saying so
// while none is set.

// ── Imports ──────────────────────────────────────────────────────────────────

import { define_plugin } from "@x-tech-laboratories/x-libs/plugins";

import type { OtherIds } from "../other_ids.ts";
import type { MediaPlugin, MediaPluginApi } from "../plugins/host.ts";
import { tmdb_manifest } from "./manifests.ts";
import type { MediaType } from "./model.ts";
import { create_tmdb, type Tmdb, type TmdbTitle } from "./tmdb.ts";

// ── Shapes ───────────────────────────────────────────────────────────────────

// A movie or show as a catalogue finds it in a search, in TMDB's shape with other catalogues' ids beside.
export interface CatalogHit extends TmdbTitle {
  imdb_id: string;
  other_ids: OtherIds;
}

// What a catalogue says of one movie or show; its poster_path is a TMDB image path or a whole address.
export interface CatalogTitle extends CatalogHit {
  genres: string;
  // Minutes.
  runtime: number;
  // Aired episodes outside the specials; 0 when not known or for a movie.
  total_episodes: number;
}

// A movies and shows catalogue as its plugin provides it to the library.
export interface TitleCatalog {
  // TMDB, or another's own name for itself, which its ids are kept under in other_ids.
  source: string;
  label: string;
  // Why it cannot be asked now, such as a missing key; "" when it can.
  missing: string;
  // TMDB's own client, for cast, seasons and IMDb lookups; null for any other catalogue.
  client: Tmdb | null;
  search?: (query: string, media_type: MediaType | "all") => Promise<CatalogHit[]>;
  // A movie or show by this catalogue's own id.
  title?: (media_type: MediaType, id: string) => Promise<CatalogTitle>;
}

export function empty_title(media_type: MediaType): CatalogTitle {
  return { tmdb_id: "", imdb_id: "", other_ids: {}, media_type, name: "", year: "", overview: "", poster_path: "", genres: "", runtime: 0, total_episodes: 0 };
}

// ── Plugins ──────────────────────────────────────────────────────────────────

export const tmdb_plugin = define_plugin<MediaPluginApi>({
  ...tmdb_manifest,
  start: (context) => {
    const key = String(context.settings().api_key ?? "").trim();
    const named = { source: "tmdb", label: tmdb_manifest.name };
    if (!key) {
      context.provide("title_catalog", "tmdb", { ...named, missing: "Set a TMDB API key in Settings first.", client: null } satisfies TitleCatalog);
      return;
    }
    const client = create_tmdb(key);
    context.provide("title_catalog", "tmdb", {
      ...named,
      missing: "",
      client,
      search: async (query, media_type) => (await client.search(query, media_type)).map((found) => ({ ...found, imdb_id: "", other_ids: {} })),
      title: async (media_type, id) => {
        const { season_counts: _season_counts, ...details } = await client.details(media_type, id);
        return { ...details, other_ids: {} };
      },
    } satisfies TitleCatalog);
  },
});

export const title_catalog_plugins: MediaPlugin[] = [tmdb_plugin];
