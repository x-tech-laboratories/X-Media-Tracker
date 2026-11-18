// What RAWG, MobyGames, Giant Bomb, Wikidata and Steam say of a game, in one shape, and the rules for joining their
// answers about the same game; each catalogue's client turns its own answers into this shape.

// ── Imports ──────────────────────────────────────────────────────────────────

import { game_id_keys, shares_a_game_id, type GameIds, type GameSource } from "./model.ts";

// ── Shapes ───────────────────────────────────────────────────────────────────

export const catalog_labels: Record<GameSource, string> = { rawg: "RAWG", mobygames: "MobyGames", giantbomb: "Giant Bomb", wikidata: "Wikidata", steam: "Steam" };

export interface CatalogGame extends GameIds {
  // The catalogues this answer came from, first the one searched.
  sources: GameSource[];
  title: string;
  year: string;
  release_date: string;
  overview: string;
  // Box art, upright where the catalogue has it, and the catalogue it came from.
  cover_url: string;
  cover_source: GameSource | "";
  // A wide picture, used only when no catalogue has box art.
  banner_url: string;
  genres: string;
  platforms: string;
  developers: string;
  publishers: string;
}

export function empty_game(source: GameSource): CatalogGame {
  return {
    sources: [source],
    rawg_id: "",
    mobygames_id: "",
    giantbomb_id: "",
    wikidata_id: "",
    steam_app_id: "",
    igdb_id: "",
    title: "",
    year: "",
    release_date: "",
    overview: "",
    cover_url: "",
    cover_source: "",
    banner_url: "",
    genres: "",
    platforms: "",
    developers: "",
    publishers: "",
  };
}

// ── Requests ─────────────────────────────────────────────────────────────────

export type Fetch = typeof fetch;

export type Json = Record<string, unknown>;

const timeout_in_milliseconds = 20_000;

// Every catalogue asks callers to name themselves.
export const user_agent = "X-Media-Tracker (https://github.com/x-tech-laboratories/X-Media-Tracker)";

// One JSON answer, failing in the catalogue's name and never repeating the address or its key.
export async function fetch_json(fetcher: Fetch, service: string, address: string, init: RequestInit = {}): Promise<Json> {
  let response: Response;
  try {
    response = await fetcher(address, { ...init, signal: AbortSignal.timeout(timeout_in_milliseconds) });
  } catch {
    throw new Error(`${service} could not be reached.`);
  }
  if (response.status === 401 || response.status === 403) throw new Error(`${service} refused the key.`);
  if (response.status === 404) throw new Error(`${service} has no such game.`);
  if (response.status === 429) throw new Error(`${service} asks to slow down; try again in a minute.`);
  if (!response.ok) throw new Error(`${service} request failed (HTTP ${response.status})`);
  try {
    return (await response.json()) as Json;
  } catch {
    throw new Error(`${service} gave an answer that is not JSON.`);
  }
}

export function text_of(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

export function number_of(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function list_of(value: unknown): Json[] {
  return Array.isArray(value) ? (value.filter((each) => each && typeof each === "object") as Json[]) : [];
}

// Names from a list of objects, such as RAWG's genres, as one line without repeats.
export function names_of(value: unknown, field = "name"): string {
  return [...new Set(list_of(value).map((each) => text_of(each[field])).filter(Boolean))].join(", ");
}

// HTML as plain text, keeping paragraph breaks.
export function plain_text(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h\d)\s*>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── Joining ──────────────────────────────────────────────────────────────────

// Lower case, without punctuation, a leading article or a trademark sign, so "The Witcher 3: Wild Hunt" meets "Witcher 3 Wild Hunt".
export function title_words(title: string): string {
  return title
    .toLowerCase()
    .replace(/[™®©]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/^(the|a|an) /, "");
}

// Whether two answers are likely one game: a shared id, or the same title in the same year when both give one.
export function same_game(first: CatalogGame, second: CatalogGame): boolean {
  if (shares_a_game_id(first, second)) return true;
  // Two different ids from one catalogue are two games.
  if (game_id_keys.some((key) => first[key] && second[key] && first[key] !== second[key])) return false;
  if (title_words(first.title) !== title_words(second.title)) return false;
  return !first.year || !second.year || first.year === second.year;
}

// Box art from the catalogue best at it: MobyGames and Giant Bomb keep covers, Steam its upright library art.
const cover_order: GameSource[] = ["mobygames", "giantbomb", "steam", "rawg", "wikidata"];

// The first answer wins where both say something; the second fills what the first lacks.
export function merge_games(first: CatalogGame, second: CatalogGame): CatalogGame {
  const fill = (mine: string, theirs: string) => mine || theirs;
  const rank = (game: CatalogGame) => (game.cover_url && game.cover_source ? cover_order.indexOf(game.cover_source) : game.cover_url ? cover_order.length : cover_order.length + 1);
  const cover_from = rank(second) < rank(first) ? second : first;
  return {
    sources: [...new Set([...first.sources, ...second.sources])],
    rawg_id: fill(first.rawg_id, second.rawg_id),
    mobygames_id: fill(first.mobygames_id, second.mobygames_id),
    giantbomb_id: fill(first.giantbomb_id, second.giantbomb_id),
    wikidata_id: fill(first.wikidata_id, second.wikidata_id),
    steam_app_id: fill(first.steam_app_id, second.steam_app_id),
    igdb_id: fill(first.igdb_id, second.igdb_id),
    title: fill(first.title, second.title),
    year: fill(first.year, second.year),
    release_date: fill(first.release_date, second.release_date),
    overview: fill(first.overview, second.overview),
    cover_url: cover_from.cover_url,
    cover_source: cover_from.cover_source,
    banner_url: fill(first.banner_url, second.banner_url),
    genres: fill(first.genres, second.genres),
    platforms: fill(first.platforms, second.platforms),
    developers: fill(first.developers, second.developers),
    publishers: fill(first.publishers, second.publishers),
  };
}

// Answers from several catalogues as one list: the same game once, in the order first found.
export function join_results(lists: CatalogGame[][]): CatalogGame[] {
  const joined: CatalogGame[] = [];
  for (const list of lists) {
    for (const game of list) {
      const index = joined.findIndex((each) => same_game(each, game));
      if (index >= 0) joined[index] = merge_games(joined[index]!, game);
      else joined.push(game);
    }
  }
  return joined;
}
