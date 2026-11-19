// itch.io: a game's title, creators, tags and cover from its page's data.json, which needs no key but is not a published
// API, and with the user's API key the games their account owns, bought or claimed, from its official API. A game's
// itch.io id here is its page as its creator's name and slug, such as innersloth/among-us.

// ── Imports ──────────────────────────────────────────────────────────────────

import { empty_game, fetch_json, list_of, text_of, user_agent, type CatalogGame, type Fetch, type Json } from "./catalog.ts";
import { itchio_link, parse_itchio_id, release_day } from "./model.ts";

// ── Requests ─────────────────────────────────────────────────────────────────

const api_base = "https://api.itch.io";
// The most owned keys a page gives.
const keys_per_page = 500;
// A guard against a page that never comes back empty.
const most_pages = 200;

const system_traits: Record<string, string> = { p_windows: "Windows", p_osx: "macOS", p_linux: "Linux", p_android: "Android" };

export interface OwnedItchGame {
  itchio_id: string;
  title: string;
  cover_url: string;
  // The systems it has downloads for, such as "Windows, Linux".
  platforms: string;
  // The day it was published on itch.io, such as 2019-01-03, or "".
  published: string;
}

export interface Itchio {
  game: (id: string) => Promise<CatalogGame>;
  owned: (key: string) => Promise<OwnedItchGame[]>;
}

function systems_of(traits: unknown): string {
  return (Array.isArray(traits) ? traits : [])
    .map((trait) => system_traits[text_of(trait)] ?? "")
    .filter(Boolean)
    .join(", ");
}

// Owned keys name games, but also soundtracks, comics and tools, and one game may be owned twice, as bought and claimed.
function owned_games(keys: Json[]): OwnedItchGame[] {
  const found = new Map<string, OwnedItchGame>();
  for (const key of keys) {
    const game = (key.game ?? {}) as Json;
    const itchio_id = parse_itchio_id(text_of(game.url));
    if (!itchio_id || found.has(itchio_id) || (text_of(game.classification) || "game") !== "game") continue;
    const published = text_of(game.published_at) || text_of(game.created_at);
    found.set(itchio_id, { itchio_id, title: text_of(game.title), cover_url: text_of(game.cover_url), platforms: systems_of(game.traits), published: published ? release_day(published) : "" });
  }
  return [...found.values()];
}

export function create_itchio(fetcher: Fetch = fetch): Itchio {
  return {
    game: async (id) => {
      const json = await fetch_json(fetcher, "itch.io", `${itchio_link(id)}/data.json`, { headers: { "User-Agent": user_agent } });
      const title = text_of(json.title);
      if (!title) throw new Error("itch.io has no such game.");
      const cover = text_of(json.cover_image);
      return {
        ...empty_game("itchio"),
        itchio_id: id,
        title,
        cover_url: cover,
        cover_source: cover ? "itchio" : "",
        genres: (Array.isArray(json.tags) ? json.tags : []).map(text_of).filter(Boolean).join(", "),
        developers: [...new Set(list_of(json.authors).map((author) => text_of(author.name)).filter(Boolean))].join(", "),
      };
    },
    // Pages are asked for until one comes back empty, as itch.io asks, since a page may hold fewer keys than it could.
    owned: async (key) => {
      const headers = { Authorization: `Bearer ${key}`, "User-Agent": user_agent };
      const keys: Json[] = [];
      for (let page = 1; page <= most_pages; page++) {
        const search = new URLSearchParams({ page: String(page), per_page: String(keys_per_page) });
        const json = await fetch_json(fetcher, "itch.io", `${api_base}/profile/owned-keys?${search.toString()}`, { headers });
        if (Array.isArray(json.errors) && json.errors.length > 0) throw new Error(`itch.io refused: ${json.errors.map(text_of).join("; ")}`);
        const listed = list_of(json.owned_keys);
        if (listed.length === 0) break;
        keys.push(...listed);
      }
      return owned_games(keys);
    },
  };
}
