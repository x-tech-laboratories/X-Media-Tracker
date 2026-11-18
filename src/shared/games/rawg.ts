// RAWG, the largest game catalogue, reached with the user's key: searching games and a game's details. A game's RAWG
// id here is its slug, such as portal-2, as Wikidata and RAWG's own links name it.

// ── Imports ──────────────────────────────────────────────────────────────────

import { empty_game, fetch_json, list_of, names_of, text_of, user_agent, type CatalogGame, type Fetch, type Json } from "./catalog.ts";

// ── Requests ─────────────────────────────────────────────────────────────────

const api_base = "https://api.rawg.io/api";
const results_shown = 20;

export interface Rawg {
  search: (query: string) => Promise<CatalogGame[]>;
  game: (slug: string) => Promise<CatalogGame>;
}

function platform_names(value: unknown): string {
  return [...new Set(list_of(value).map((each) => text_of((each.platform as Json | undefined)?.name)).filter(Boolean))].join(", ");
}

function game_of(json: Json): CatalogGame {
  const released = text_of(json.released);
  return {
    ...empty_game("rawg"),
    rawg_id: text_of(json.slug),
    title: text_of(json.name),
    year: released.slice(0, 4),
    release_date: released,
    overview: text_of(json.description_raw),
    // RAWG keeps a wide screenshot, not box art.
    banner_url: text_of(json.background_image),
    genres: names_of(json.genres),
    platforms: platform_names(json.platforms),
    developers: names_of(json.developers),
    publishers: names_of(json.publishers),
  };
}

export function create_rawg(key: string, fetcher: Fetch = fetch): Rawg {
  const get = (path: string, query: Record<string, string> = {}) =>
    fetch_json(fetcher, "RAWG", `${api_base}${path}?${new URLSearchParams({ ...query, key }).toString()}`, { headers: { "User-Agent": user_agent } });

  return {
    search: async (query) => {
      if (!query.trim()) return [];
      const json = await get("/games", { search: query, search_precise: "true", page_size: String(results_shown) });
      return list_of(json.results).map(game_of);
    },
    game: async (slug) => game_of(await get(`/games/${encodeURIComponent(slug)}`)),
  };
}
