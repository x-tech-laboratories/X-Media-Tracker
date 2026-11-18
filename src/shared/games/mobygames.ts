// MobyGames, the most carefully kept game catalogue, reached with the user's key: searching games and a game's details
// with its box art. Its free key allows about one request a second, so requests wait their turn.

// ── Imports ──────────────────────────────────────────────────────────────────

import { empty_game, fetch_json, list_of, names_of, number_of, plain_text, text_of, user_agent, type CatalogGame, type Fetch, type Json } from "./catalog.ts";
import { release_day } from "./model.ts";

// ── Requests ─────────────────────────────────────────────────────────────────

const api_base = "https://api.mobygames.com/v1";
const results_shown = 20;
const request_gap_in_milliseconds = 1100;

export interface MobyGames {
  search: (query: string) => Promise<CatalogGame[]>;
  game: (id: string) => Promise<CatalogGame>;
}

// When the next request may go, shared by every client so a refresh of many games stays under the limit.
let next_slot = 0;

async function wait_turn(): Promise<void> {
  const now = performance.now();
  const at = Math.max(now, next_slot);
  next_slot = at + request_gap_in_milliseconds;
  if (at > now) await new Promise((resolve) => setTimeout(resolve, at - now));
}

// The earliest release over every platform, such as "2011-04-18".
function first_release(platforms: unknown): string {
  const days = list_of(platforms)
    .map((each) => release_day(text_of(each.first_release_date)))
    .filter(Boolean)
    .sort();
  return days[0] ?? "";
}

function game_of(json: Json): CatalogGame {
  const release_date = first_release(json.platforms);
  const cover = text_of((json.sample_cover as Json | undefined)?.image);
  return {
    ...empty_game("mobygames"),
    mobygames_id: number_of(json.game_id) ? String(number_of(json.game_id)) : "",
    title: text_of(json.title),
    year: release_date.slice(0, 4),
    release_date,
    overview: plain_text(text_of(json.description)),
    cover_url: cover,
    cover_source: cover ? "mobygames" : "",
    // Only the basic genres, such as Action, not its perspective or setting.
    genres: names_of(
      list_of(json.genres).filter((each) => text_of(each.genre_category) === "Basic Genres"),
      "genre_name",
    ),
    platforms: names_of(json.platforms, "platform_name"),
  };
}

export function create_mobygames(key: string, fetcher: Fetch = fetch): MobyGames {
  const get = async (path: string, query: Record<string, string> = {}) => {
    await wait_turn();
    return fetch_json(fetcher, "MobyGames", `${api_base}${path}?${new URLSearchParams({ ...query, api_key: key }).toString()}`, { headers: { "User-Agent": user_agent } });
  };

  return {
    search: async (query) => {
      if (!query.trim()) return [];
      const json = await get("/games", { title: query, format: "normal", limit: String(results_shown) });
      return list_of(json.games).map(game_of);
    },
    game: async (id) => {
      const json = await get("/games", { id, format: "normal" });
      const found = list_of(json.games)[0];
      if (!found) throw new Error("MobyGames has no such game.");
      return game_of(found);
    },
  };
}
