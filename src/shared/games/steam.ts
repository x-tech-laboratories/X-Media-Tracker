// Steam: the store's search and a game's details, which need no key, and with the user's Web API key the games a
// profile owns with their playtime, and its wishlist.

// ── Imports ──────────────────────────────────────────────────────────────────

import { empty_game, fetch_json, list_of, names_of, number_of, plain_text, text_of, type CatalogGame, type Fetch, type Json } from "./catalog.ts";
import { day_of_unix, release_day } from "./model.ts";

// ── Requests ─────────────────────────────────────────────────────────────────

const store_base = "https://store.steampowered.com";
const api_base = "https://api.steampowered.com";
const assets_base = "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps";
// GetItems takes this many games at once.
const items_per_request = 100;

export interface OwnedGame {
  app_id: string;
  title: string;
  playtime_minutes: number;
  last_played: string;
}

export interface WishedGame {
  app_id: string;
  title: string;
  release_date: string;
}

export interface Steam {
  search: (query: string) => Promise<CatalogGame[]>;
  game: (app_id: string) => Promise<CatalogGame>;
  owned: (key: string, steam_id: string) => Promise<OwnedGame[]>;
  wishlist: (key: string, steam_id: string) => Promise<WishedGame[]>;
  // The 64-bit id of the profile with the custom URL name given.
  profile_id: (key: string, name: string) => Promise<string>;
}

// The upright library art Steam keeps for nearly every game.
export function steam_cover(app_id: string): string {
  return app_id ? `${assets_base}/${app_id}/library_600x900.jpg` : "";
}

// A Steam id is the profile's 64-bit number, such as 76561197960287930, alone or in a profile link.
export function parse_steam_id(input: string): string {
  return /\b7656\d{13}\b/.exec(input)?.[0] ?? "";
}

// A profile's custom URL name, such as gabelogannewell, alone or in a link such as steamcommunity.com/id/gabelogannewell.
export function parse_steam_name(input: string): string {
  const text = input.trim();
  const linked = /steamcommunity\.com\/id\/([^/?#\s]+)/i.exec(text);
  if (linked) return decodeURIComponent(linked[1]!);
  return /^[\w-]{2,32}$/.test(text) ? text : "";
}

function platform_names(platforms: unknown): string {
  const flags = (platforms ?? {}) as Json;
  return [flags.windows && "Windows", flags.mac && "macOS", flags.linux && "Linux"].filter(Boolean).join(", ");
}

export function create_steam(fetcher: Fetch = fetch): Steam {
  const get = (base: string, path: string, query: Record<string, string>) => fetch_json(fetcher, "Steam", `${base}${path}?${new URLSearchParams(query).toString()}`);

  // The store's names and release days for many games, in batches.
  async function items(app_ids: string[]): Promise<Map<string, Json>> {
    const found = new Map<string, Json>();
    for (let start = 0; start < app_ids.length; start += items_per_request) {
      const ids = app_ids.slice(start, start + items_per_request).map((appid) => ({ appid: Number(appid) }));
      const input = { ids, context: { language: "english", country_code: "US" }, data_request: { include_release: true } };
      const json = await get(api_base, "/IStoreBrowseService/GetItems/v1/", { input_json: JSON.stringify(input) });
      for (const item of list_of((json.response as Json | undefined)?.store_items)) found.set(text_of(item.appid ?? item.id), item);
    }
    return found;
  }

  return {
    search: async (query) => {
      if (!query.trim()) return [];
      const json = await get(store_base, "/api/storesearch/", { term: query, l: "english", cc: "US" });
      return list_of(json.items)
        .filter((item) => text_of(item.type) === "app")
        .map((item) => {
          const app_id = text_of(item.id);
          return { ...empty_game("steam"), steam_app_id: app_id, title: text_of(item.name), cover_url: steam_cover(app_id), cover_source: "steam", platforms: platform_names(item.platforms) };
        });
    },
    game: async (app_id) => {
      const json = await get(store_base, "/api/appdetails", { appids: app_id, l: "english" });
      const entry = (json[app_id] ?? {}) as Json;
      const data = entry.data as Json | undefined;
      if (entry.success !== true || !data) throw new Error("Steam has no such game.");
      const release_date = release_day(text_of((data.release_date as Json | undefined)?.date));
      return {
        ...empty_game("steam"),
        steam_app_id: app_id,
        title: text_of(data.name),
        year: release_date.slice(0, 4),
        release_date,
        overview: plain_text(text_of(data.short_description)),
        cover_url: steam_cover(app_id),
        cover_source: "steam",
        banner_url: text_of(data.header_image),
        genres: names_of(data.genres, "description"),
        platforms: platform_names(data.platforms),
        developers: (Array.isArray(data.developers) ? data.developers : []).map(text_of).filter(Boolean).join(", "),
        publishers: (Array.isArray(data.publishers) ? data.publishers : []).map(text_of).filter(Boolean).join(", "),
      };
    },
    owned: async (key, steam_id) => {
      const json = await get(api_base, "/IPlayerService/GetOwnedGames/v1/", { key, steamid: steam_id, include_appinfo: "1", include_played_free_games: "1", format: "json" });
      const response = (json.response ?? {}) as Json;
      if (!Array.isArray(response.games)) throw new Error("Steam listed no games; set the profile's Game details to Public in its privacy settings.");
      return list_of(response.games).map((game) => ({
        app_id: text_of(game.appid),
        title: text_of(game.name),
        playtime_minutes: number_of(game.playtime_forever),
        last_played: day_of_unix(number_of(game.rtime_last_played)),
      }));
    },
    wishlist: async (key, steam_id) => {
      const json = await get(api_base, "/IWishlistService/GetWishlist/v1/", { ...(key ? { key } : {}), steamid: steam_id });
      const app_ids = list_of((json.response as Json | undefined)?.items).map((item) => text_of(item.appid)).filter(Boolean);
      const details = await items(app_ids);
      return app_ids.map((app_id) => {
        const item = details.get(app_id) ?? {};
        const release = (item.release ?? {}) as Json;
        return { app_id, title: text_of(item.name), release_date: day_of_unix(number_of(release.steam_release_date)) };
      });
    },
    profile_id: async (key, name) => {
      const json = await get(api_base, "/ISteamUser/ResolveVanityURL/v1/", { key, vanityurl: name });
      const response = (json.response ?? {}) as Json;
      const steam_id = response.success === 1 ? parse_steam_id(text_of(response.steamid)) : "";
      if (!steam_id) throw new Error(`Steam has no profile with the custom URL ${name}; check the name in your profile's link, or use its 64-bit id.`);
      return steam_id;
    },
  };
}
