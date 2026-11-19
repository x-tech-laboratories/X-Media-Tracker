// TheGamesDB, strongest on console and older games, reached with the user's key: searching games and a game's details
// with its box art. It keeps one entry for each platform a game came out on, and its key allows so many requests a month.

// ── Imports ──────────────────────────────────────────────────────────────────

import { empty_game, fetch_json, list_of, number_of, text_of, title_words, user_agent, type CatalogGame, type Fetch, type Json } from "./catalog.ts";
import { release_day } from "./model.ts";

// ── Requests ─────────────────────────────────────────────────────────────────

const api_base = "https://api.thegamesdb.net";
const fields = "players,publishers,genres,overview";
const include = "boxart,platform";

export interface TheGamesDb {
  search: (query: string) => Promise<CatalogGame[]>;
  game: (id: string) => Promise<CatalogGame>;
}

type Names = Map<string, string>;

// The names of genres, developers and publishers by their ids, each list asked for once while the program runs.
const name_lists = new Map<string, Promise<Names>>();

// Box art's front side and the platforms' names, which come with a game's answer.
interface Included {
  boxart_base: string;
  boxart: Record<string, Json[]>;
  platforms: Record<string, Json>;
}

function included_of(json: Json): Included {
  const include = (json.include ?? {}) as Json;
  const boxart = (include.boxart ?? {}) as Json;
  const base = (boxart.base_url ?? {}) as Json;
  return {
    boxart_base: text_of(base.large) || text_of(base.original),
    boxart: (boxart.data ?? {}) as Record<string, Json[]>,
    platforms: ((include.platform as Json | undefined)?.data ?? {}) as Record<string, Json>,
  };
}

function named(ids: unknown, names: Names): string {
  return [...new Set((Array.isArray(ids) ? ids : []).map((id) => names.get(text_of(id)) ?? "").filter(Boolean))].join(", ");
}

export function create_thegamesdb(key: string, fetcher: Fetch = fetch): TheGamesDb {
  const get = async (path: string, query: Record<string, string> = {}) => {
    const json = await fetch_json(fetcher, "TheGamesDB", `${api_base}${path}?${new URLSearchParams({ ...query, apikey: key }).toString()}`, { headers: { "User-Agent": user_agent } });
    const code = number_of(json.code);
    if (code === 401 || code === 403) throw new Error("TheGamesDB refused the key.");
    if (code && code !== 200) throw new Error(`TheGamesDB said: ${text_of(json.status) || "the request failed"}.`);
    return json;
  };

  // A list such as /v1/Genres as names by id; one that fails is asked for again next time.
  function names(path: string, field: string): Promise<Names> {
    let list = name_lists.get(path);
    if (!list) {
      list = get(path).then((json) => {
        const found = ((json.data as Json | undefined)?.[field] ?? {}) as Record<string, Json>;
        return new Map(Object.values(found).map((each) => [text_of(each.id), text_of(each.name)]));
      });
      name_lists.set(path, list);
      list.catch(() => name_lists.delete(path));
    }
    return list;
  }

  async function games_of(json: Json): Promise<CatalogGame[]> {
    const games = list_of((json.data as Json | undefined)?.games);
    if (games.length === 0) return [];
    const [genres, developers, publishers] = await Promise.all([names("/v1/Genres", "genres"), names("/v1/Developers", "developers"), names("/v1/Publishers", "publishers")]);
    const included = included_of(json);
    return games.map((game) => {
      const id = text_of(game.id);
      const front = (included.boxart[id] ?? []).find((each) => text_of(each.side) === "front");
      const cover = front && included.boxart_base ? `${included.boxart_base}${text_of(front.filename)}` : "";
      const release_date = release_day(text_of(game.release_date));
      return {
        ...empty_game("thegamesdb"),
        thegamesdb_id: id,
        title: text_of(game.game_title),
        year: release_date.slice(0, 4),
        release_date,
        overview: text_of(game.overview),
        cover_url: cover,
        cover_source: cover ? "thegamesdb" : "",
        genres: named(game.genres, genres),
        platforms: text_of(included.platforms[text_of(game.platform)]?.name),
        developers: named(game.developers, developers),
        publishers: named(game.publishers, publishers),
      };
    });
  }

  return {
    search: async (query) => {
      if (!query.trim()) return [];
      const found = await games_of(await get("/v1.1/Games/ByGameName", { name: query, fields, include }));
      // The same game on several platforms shows once, with every platform.
      const joined: CatalogGame[] = [];
      for (const game of found) {
        const same = joined.find((each) => title_words(each.title) === title_words(game.title));
        if (!same) joined.push(game);
        else if (game.platforms && !same.platforms.split(", ").includes(game.platforms)) same.platforms = [same.platforms, game.platforms].filter(Boolean).join(", ");
      }
      return joined;
    },
    game: async (id) => {
      const [found] = await games_of(await get("/v1/Games/ByGameID", { id, fields, include }));
      if (!found) throw new Error("TheGamesDB has no such game.");
      return found;
    },
  };
}
