// Giant Bomb's wiki, reached with the user's key: searching games and a game's details with its box art. A game's
// Giant Bomb id is its guid, such as 3030-2980.

// ── Imports ──────────────────────────────────────────────────────────────────

import { empty_game, fetch_json, list_of, names_of, text_of, user_agent, type CatalogGame, type Fetch, type Json } from "./catalog.ts";
import { release_day } from "./model.ts";

// ── Requests ─────────────────────────────────────────────────────────────────

const api_base = "https://www.giantbomb.com/api";
const results_shown = 20;
const fields = "guid,name,deck,original_release_date,expected_release_year,image,platforms,genres,developers,publishers";

// Giant Bomb answers every request with a status code of its own; 1 is OK and 100 a refused key.
const ok_status = 1;
const bad_key_status = 100;

export interface GiantBomb {
  search: (query: string) => Promise<CatalogGame[]>;
  game: (guid: string) => Promise<CatalogGame>;
}

function game_of(json: Json): CatalogGame {
  const release_date = release_day(text_of(json.original_release_date));
  const image = (json.image ?? {}) as Json;
  const cover = text_of(image.super_url) || text_of(image.original_url);
  return {
    ...empty_game("giantbomb"),
    giantbomb_id: text_of(json.guid),
    title: text_of(json.name),
    year: release_date.slice(0, 4) || text_of(json.expected_release_year),
    release_date,
    overview: text_of(json.deck),
    cover_url: cover,
    cover_source: cover ? "giantbomb" : "",
    genres: names_of(json.genres),
    platforms: names_of(json.platforms),
    developers: names_of(json.developers),
    publishers: names_of(json.publishers),
  };
}

export function create_giantbomb(key: string, fetcher: Fetch = fetch): GiantBomb {
  const get = async (path: string, query: Record<string, string> = {}) => {
    const json = await fetch_json(fetcher, "Giant Bomb", `${api_base}${path}?${new URLSearchParams({ ...query, api_key: key, format: "json", field_list: fields }).toString()}`, {
      headers: { "User-Agent": user_agent },
    });
    if (json.status_code === bad_key_status) throw new Error("Giant Bomb refused the key.");
    if (json.status_code !== undefined && json.status_code !== ok_status) throw new Error(`Giant Bomb said: ${text_of(json.error) || "the request failed"}.`);
    return json;
  };

  return {
    search: async (query) => {
      if (!query.trim()) return [];
      const json = await get("/search/", { query, resources: "game", limit: String(results_shown) });
      return list_of(json.results).map(game_of);
    },
    game: async (guid) => {
      const json = await get(`/game/${encodeURIComponent(guid)}/`);
      const found = json.results;
      if (!found || typeof found !== "object" || Array.isArray(found)) throw new Error("Giant Bomb has no such game.");
      return game_of(found as Json);
    },
  };
}
