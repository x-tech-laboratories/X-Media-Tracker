// SteamGridDB, its users' art for games, reached with the user's key: box art in Steam's upright library shape for a
// game found by its SteamGridDB id, its Steam app or its title. It gives no details beyond a game's name and year.

// ── Imports ──────────────────────────────────────────────────────────────────

import { empty_game, fetch_json, list_of, number_of, text_of, user_agent, type CatalogGame, type Fetch, type Json } from "./catalog.ts";
import { day_of_unix } from "./model.ts";

// ── Requests ─────────────────────────────────────────────────────────────────

const api_base = "https://www.steamgriddb.com/api/v2";
// Upright art the size of Steam's library art, without animations.
const grid_query = { dimensions: "600x900", types: "static", nsfw: "false", humor: "false" };

export interface SteamGridDb {
  // Games whose name starts like the words given, for finding one by its title.
  search: (query: string) => Promise<CatalogGame[]>;
  game: (id: string) => Promise<CatalogGame>;
  // The SteamGridDB id of a Steam app, or "" when it has none.
  by_steam: (app_id: string) => Promise<string>;
}

function game_of(json: Json): CatalogGame {
  const release_date = day_of_unix(number_of(json.release_date));
  return { ...empty_game("steamgriddb"), steamgriddb_id: text_of(json.id), title: text_of(json.name), year: release_date.slice(0, 4) };
}

export function create_steamgriddb(key: string, fetcher: Fetch = fetch): SteamGridDb {
  const get = async (path: string, query: Record<string, string> = {}) => {
    const search = new URLSearchParams(query).toString();
    const json = await fetch_json(fetcher, "SteamGridDB", `${api_base}${path}${search ? `?${search}` : ""}`, { headers: { "User-Agent": user_agent, Authorization: `Bearer ${key}` } });
    if (json.success === false) throw new Error(`SteamGridDB said: ${text_of((Array.isArray(json.errors) ? json.errors : [])[0]) || "the request failed"}.`);
    return json;
  };

  return {
    search: async (query) => {
      if (!query.trim()) return [];
      return list_of((await get(`/search/autocomplete/${encodeURIComponent(query.trim())}`)).data).map(game_of);
    },
    game: async (id) => {
      const [found, grids] = await Promise.all([get(`/games/id/${encodeURIComponent(id)}`), get(`/grids/game/${encodeURIComponent(id)}`, grid_query)]);
      const game = game_of((found.data ?? {}) as Json);
      if (!game.steamgriddb_id) throw new Error("SteamGridDB has no such game.");
      // SteamGridDB lists a game's art best voted first.
      const cover = text_of(list_of(grids.data)[0]?.url);
      return { ...game, cover_url: cover, cover_source: cover ? "steamgriddb" : "" };
    },
    by_steam: async (app_id) => {
      const json = await get(`/games/steam/${encodeURIComponent(app_id)}`).catch((error: Error) => {
        if (/no such game/.test(error.message)) return {} as Json;
        throw error;
      });
      return text_of((json.data as Json | undefined)?.id);
    },
  };
}
