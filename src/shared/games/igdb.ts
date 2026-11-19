// IGDB, Twitch's game catalogue, reached with the user's Twitch app: searching games and a game's details with its box
// art. A game's IGDB id here is its slug, such as portal-2, as Wikidata, IGDB's links and its data export name it.

// ── Imports ──────────────────────────────────────────────────────────────────

import { empty_game, fetch_json, list_of, names_of, number_of, text_of, user_agent, type CatalogGame, type Fetch, type Json } from "./catalog.ts";
import { day_of_unix } from "./model.ts";

// ── Requests ─────────────────────────────────────────────────────────────────

const twitch_sign_in = "https://id.twitch.tv/oauth2/token";
const api_base = "https://api.igdb.com/v4";
const image_base = "https://images.igdb.com/igdb/image/upload/t_cover_big_2x";
const results_shown = 20;
// IGDB allows four requests a second.
const request_gap_in_milliseconds = 260;
// An access is renewed this long before Twitch says it ends.
const renew_early_in_milliseconds = 60_000;

const fields = [
  "name",
  "slug",
  "summary",
  "first_release_date",
  "cover.image_id",
  "genres.name",
  "platforms.name",
  "involved_companies.developer",
  "involved_companies.publisher",
  "involved_companies.company.name",
  "parent_game.slug",
  "parent_game.name",
  "game_type.type",
  "external_games.uid",
  "external_games.external_game_source",
].join(",");

// The game types that add to another game, and external_game_source 1, which is Steam.
const add_on_types = ["dlc", "expansion", "standalone expansion"];
const steam_source = 1;

export interface Igdb {
  search: (query: string) => Promise<CatalogGame[]>;
  game: (slug: string) => Promise<CatalogGame>;
}

// When the next request may go, shared by every client so a refresh of many games stays under the limit.
let next_slot = 0;

async function wait_turn(): Promise<void> {
  const now = performance.now();
  const at = Math.max(now, next_slot);
  next_slot = at + request_gap_in_milliseconds;
  if (at > now) await new Promise((resolve) => setTimeout(resolve, at - now));
}

// Each Twitch app's access and when it ends, kept while the program runs.
const accesses = new Map<string, { access: Promise<string>; ends_at: number }>();

function companies(json: Json, role: "developer" | "publisher"): string {
  return names_of(
    list_of(json.involved_companies)
      .filter((each) => each[role] === true)
      .map((each) => (each.company ?? {}) as Json),
  );
}

function game_of(json: Json): CatalogGame {
  const release_date = day_of_unix(number_of(json.first_release_date));
  const image = text_of((json.cover as Json | undefined)?.image_id);
  const parent = (json.parent_game ?? {}) as Json;
  const type = text_of((json.game_type as Json | undefined)?.type).toLowerCase();
  const is_add_on = add_on_types.includes(type) && !!text_of(parent.slug);
  const steam = text_of(list_of(json.external_games).find((each) => number_of(each.external_game_source) === steam_source)?.uid);
  return {
    ...empty_game("igdb"),
    igdb_id: text_of(json.slug),
    steam_app_id: /^\d+$/.test(steam) ? steam : "",
    title: text_of(json.name),
    year: release_date.slice(0, 4),
    release_date,
    overview: text_of(json.summary),
    cover_url: image ? `${image_base}/${image}.jpg` : "",
    cover_source: image ? "igdb" : "",
    genres: names_of(json.genres),
    platforms: names_of(json.platforms),
    developers: companies(json, "developer"),
    publishers: companies(json, "publisher"),
    base_game: is_add_on ? `igdb:${text_of(parent.slug)}` : "",
    base_game_title: is_add_on ? text_of(parent.name) : "",
  };
}

// Text inside an IGDB query's quotes.
function quoted(text: string): string {
  return `"${text.replace(/["\\]/g, "")}"`;
}

export function create_igdb(client_id: string, client_secret: string, fetcher: Fetch = fetch): Igdb {
  const refused = () => new Error("IGDB refused the Twitch client id or secret.");

  async function sign_in(): Promise<string> {
    const query = new URLSearchParams({ client_id, client_secret, grant_type: "client_credentials" });
    const json = await fetch_json(fetcher, "IGDB", `${twitch_sign_in}?${query.toString()}`, { method: "POST", headers: { "User-Agent": user_agent } }).catch((error: Error) => {
      throw /HTTP 400|refused/.test(error.message) ? refused() : error;
    });
    const access = text_of(json.access_token);
    if (!access) throw refused();
    accesses.set(client_id, { access: Promise.resolve(access), ends_at: Date.now() + number_of(json.expires_in) * 1000 - renew_early_in_milliseconds });
    return access;
  }

  // The app's access, asked of Twitch once and kept until shortly before it ends.
  function access(): Promise<string> {
    const kept = accesses.get(client_id);
    if (kept && kept.ends_at > Date.now()) return kept.access;
    const asked = sign_in();
    accesses.set(client_id, { access: asked, ends_at: Number.POSITIVE_INFINITY });
    asked.catch(() => accesses.delete(client_id));
    return asked;
  }

  const games = async (body: string): Promise<Json[]> => {
    const bearer = await access();
    await wait_turn();
    const json = await fetch_json(fetcher, "IGDB", `${api_base}/games`, {
      method: "POST",
      headers: { "User-Agent": user_agent, "Client-ID": client_id, Authorization: `Bearer ${bearer}`, Accept: "application/json" },
      body,
    });
    return list_of(json as unknown);
  };

  return {
    search: async (query) => {
      if (!query.trim()) return [];
      return (await games(`search ${quoted(query.trim())}; fields ${fields}; limit ${results_shown};`)).map(game_of);
    },
    game: async (slug) => {
      const [found] = await games(`fields ${fields}; where slug = ${quoted(slug)}; limit 1;`);
      if (!found) throw new Error("IGDB has no such game.");
      return game_of(found);
    },
  };
}
