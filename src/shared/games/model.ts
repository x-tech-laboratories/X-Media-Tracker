// What a tracked game is, and the rules on it that need no database: which ids name the same game, pasted links,
// playtime, sorting and the Games library's filters with counts.
// The page imports this file too, so it imports nothing.

// ── Games ────────────────────────────────────────────────────────────────────

export const game_statuses = ["want_to_play", "playing", "paused", "played", "completed", "dropped"] as const;

export type GameStatus = (typeof game_statuses)[number];

export const game_status_labels: Record<GameStatus, string> = { want_to_play: "Want to play", playing: "Playing", paused: "Paused", played: "Played", completed: "Completed", dropped: "Dropped" };

export interface GameIds {
  rawg_id: string;
  mobygames_id: string;
  giantbomb_id: string;
  wikidata_id: string;
  steam_app_id: string;
  igdb_id: string;
}

export const game_id_keys = ["rawg_id", "mobygames_id", "giantbomb_id", "wikidata_id", "steam_app_id", "igdb_id"] as const satisfies readonly (keyof GameIds)[];

export interface Game extends GameIds {
  id: string;
  title: string;
  year: string;
  // The first release, such as 2011-04-18, or "".
  release_date: string;
  overview: string;
  cover_url: string;
  // The full image kept on every device, by its synced file's name, and the address it was taken from ("custom" when set by hand).
  cover_file: string;
  cover_file_from: string;
  // Each as one line, such as "Action, Puzzle".
  genres: string;
  platforms: string;
  developers: string;
  publishers: string;
  status: GameStatus;
  // 1 to 10, shown as half stars out of five; null when unrated.
  rating: number | null;
  review: string;
  // The platforms a copy is owned on, such as ["PC", "Switch"].
  owned_platforms: string[];
  // Which edition is owned, such as "Game of the Year Edition", or "".
  edition: string;
  playtime_minutes: number;
  // The day last played, such as 2026-07-20, or "".
  last_played: string;
  added_at: string;
  // The game this is DLC of, by its key such as "steam:620" or a library id, with its title; "" when not known to be.
  base_game: string;
  base_game_title: string;
}

// A game as the Games library lists it: with its collections.
export interface LibraryGame extends Game {
  collection_ids: string[];
}

export interface GameCollection {
  id: string;
  name: string;
}

export function is_game_status(value: unknown): value is GameStatus {
  return typeof value === "string" && (game_statuses as readonly string[]).includes(value);
}

// ── Ids ──────────────────────────────────────────────────────────────────────

// The strongest id first: RAWG covers the most games, then the curated catalogues, then Wikidata, then a store.
export function game_key(ids: Partial<GameIds>): string {
  for (const key of game_id_keys) {
    const value = ids[key];
    if (value) return `${key.replace(/_id$|_app_id$/, "")}:${value}`;
  }
  return "";
}

export function shares_a_game_id(first: Partial<GameIds>, second: Partial<GameIds>): boolean {
  return game_id_keys.some((key) => !!first[key] && first[key] === second[key]);
}

// A Wikidata item such as Q279744, alone or in a link.
export function parse_wikidata_id(input: string): string {
  return /\bQ\d+\b/i.exec(input)?.[0].toUpperCase() ?? "";
}

// A Giant Bomb game's guid, such as 3030-2980, alone or in a link.
export function parse_giantbomb_id(input: string): string {
  return /\b3030-\d+\b/.exec(input)?.[0] ?? "";
}

// ── DLC ──────────────────────────────────────────────────────────────────────

// A base game set by hand to none, so the catalogues no longer fill one in.
export const not_dlc = "none";

const key_fields: Record<string, keyof GameIds> = { rawg: "rawg_id", mobygames: "mobygames_id", giantbomb: "giantbomb_id", wikidata: "wikidata_id", steam: "steam_app_id", igdb: "igdb_id" };

export function is_dlc(game: Pick<Game, "base_game">): boolean {
  return !!game.base_game && game.base_game !== not_dlc;
}

// The tracked game a DLC belongs to: the one with its id, else the one with the catalogue id its key names.
export function find_base_game<Item extends Game>(game: Pick<Game, "base_game">, games: Item[]): Item | undefined {
  if (!is_dlc(game)) return undefined;
  const exact = games.find((each) => each.id === game.base_game);
  if (exact) return exact;
  const split = game.base_game.indexOf(":");
  const field = key_fields[game.base_game.slice(0, split)];
  const value = game.base_game.slice(split + 1);
  return field && value ? games.find((each) => each[field] === value) : undefined;
}

// The tracked DLC of a game, A-Z.
export function dlc_of<Item extends Game>(base: Game, games: Item[]): Item[] {
  return games.filter((each) => each.id !== base.id && find_base_game(each, [base])).sort((first, second) => first.title.localeCompare(second.title));
}

// ── Links ────────────────────────────────────────────────────────────────────

export type GameSource = "rawg" | "mobygames" | "giantbomb" | "wikidata" | "steam";

export interface ParsedGameLink {
  source: GameSource;
  id: string;
}

// A pasted RAWG, MobyGames, Giant Bomb, Wikidata or Steam store link.
export function parse_game_link(input: string): ParsedGameLink | null {
  const text = input.trim();
  const rawg = /rawg\.io\/games\/([a-z0-9-]+)/i.exec(text);
  if (rawg) return { source: "rawg", id: rawg[1]!.toLowerCase() };
  const mobygames = /mobygames\.com\/game\/(\d+)/i.exec(text);
  if (mobygames) return { source: "mobygames", id: mobygames[1]! };
  if (/giantbomb\.com\//i.test(text) && parse_giantbomb_id(text)) return { source: "giantbomb", id: parse_giantbomb_id(text) };
  const wikidata = /wikidata\.org\/(?:wiki|entity)\/(Q\d+)/i.exec(text);
  if (wikidata) return { source: "wikidata", id: wikidata[1]!.toUpperCase() };
  const steam = /store\.steampowered\.com\/app\/(\d+)/i.exec(text) ?? /steamcommunity\.com\/app\/(\d+)/i.exec(text);
  if (steam) return { source: "steam", id: steam[1]! };
  return null;
}

export function game_links(game: Partial<GameIds>): { label: string; href: string }[] {
  return [
    game.rawg_id && { label: "RAWG", href: `https://rawg.io/games/${game.rawg_id}` },
    game.mobygames_id && { label: "MobyGames", href: `https://www.mobygames.com/game/${game.mobygames_id}/` },
    game.giantbomb_id && { label: "Giant Bomb", href: `https://www.giantbomb.com/games/${game.giantbomb_id}/` },
    game.wikidata_id && { label: "Wikidata", href: `https://www.wikidata.org/wiki/${game.wikidata_id}` },
    game.steam_app_id && { label: "Steam", href: `https://store.steampowered.com/app/${game.steam_app_id}/` },
    game.igdb_id && { label: "IGDB", href: `https://www.igdb.com/games/${game.igdb_id}` },
  ].filter((link): link is { label: string; href: string } => !!link);
}

// ── Platforms and playtime ───────────────────────────────────────────────────

// Platforms one may own a game on, offered first when choosing; any other name can be typed.
export const common_platforms = ["PC", "PlayStation 5", "PlayStation 4", "Xbox Series X|S", "Xbox One", "Nintendo Switch 2", "Nintendo Switch", "macOS", "Linux", "iOS", "Android"];

// Names trimmed, empty ones dropped and the same name, whatever its case, kept once.
export function clean_names(names: string[]): string[] {
  const kept: string[] = [];
  for (const name of names.map((each) => each.trim()).filter(Boolean)) {
    if (!kept.some((each) => each.toLowerCase() === name.toLowerCase())) kept.push(name);
  }
  return kept;
}

export function format_playtime(minutes: number): string {
  if (!minutes) return "";
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${String(Math.round(minutes % 60)).padStart(2, "0")}m` : `${Math.round(minutes)}m`;
}

// ── Sorting ──────────────────────────────────────────────────────────────────

export const game_sort_keys = ["title", "last_played", "release_date", "rating", "playtime_minutes", "added_at"] as const;

export type GameSortKey = (typeof game_sort_keys)[number];

export const game_sort_labels: Record<GameSortKey, string> = {
  title: "A-Z",
  last_played: "Recently played",
  release_date: "Release date",
  rating: "Rating",
  playtime_minutes: "Playtime",
  added_at: "Recently added",
};

function sort_value(game: LibraryGame, key: GameSortKey): string | number | null {
  const value = game[key];
  return value === "" || value === 0 ? null : value;
}

// A game missing the value sorts last either way; ties fall back to the title.
export function sort_games<Item extends LibraryGame>(games: Item[], key: GameSortKey, descending: boolean): Item[] {
  const direction = descending ? -1 : 1;
  return [...games].sort((first, second) => {
    const first_value = sort_value(first, key);
    const second_value = sort_value(second, key);
    if (first_value === null || second_value === null) {
      if (first_value !== second_value) return first_value === null ? 1 : -1;
      return first.title.localeCompare(second.title);
    }
    const result = typeof first_value === "number" && typeof second_value === "number" ? first_value - second_value : String(first_value).localeCompare(String(second_value));
    return result !== 0 ? result * direction : first.title.localeCompare(second.title);
  });
}

// ── Filters ──────────────────────────────────────────────────────────────────

// "all" lets everything through; a platform or collection of "none" is games with none.
export interface GameFilters {
  search: string;
  kind: "games" | "dlc" | "all";
  status: "all" | GameStatus;
  platform: string;
  collection: string;
}

export const game_kind_labels: Record<GameFilters["kind"], string> = { games: "Games", dlc: "DLC", all: "Both" };

// DLC stays out of the library until asked for, as it shows on its game's page.
export const no_game_filters: GameFilters = { search: "", kind: "games", status: "all", platform: "all", collection: "all" };

type GameFacet = keyof GameFilters;

function matches_search(game: LibraryGame, search: string): boolean {
  const words = search.toLowerCase();
  return game.title.toLowerCase().includes(words) || game.developers.toLowerCase().includes(words) || game.genres.toLowerCase().includes(words);
}

function passes(game: LibraryGame, filters: GameFilters, skip: GameFacet | null): boolean {
  if (skip !== "search" && filters.search && !matches_search(game, filters.search)) return false;
  if (skip !== "kind" && filters.kind !== "all" && is_dlc(game) !== (filters.kind === "dlc")) return false;
  if (skip !== "status" && filters.status !== "all" && game.status !== filters.status) return false;
  if (skip !== "platform" && filters.platform !== "all") {
    if (filters.platform === "none" ? game.owned_platforms.length > 0 : !game.owned_platforms.includes(filters.platform)) return false;
  }
  if (skip !== "collection" && filters.collection !== "all") {
    if (filters.collection === "none" ? game.collection_ids.length > 0 : !game.collection_ids.includes(filters.collection)) return false;
  }
  return true;
}

export function filter_games(games: LibraryGame[], filters: GameFilters): LibraryGame[] {
  return games.filter((game) => passes(game, filters, null));
}

export type GameFacetCounts = Record<Exclude<GameFacet, "search">, Record<string, number>>;

// Each choice's count of the games it would show: narrowed by every other filter but never by its own.
export function game_facet_counts(games: LibraryGame[], filters: GameFilters): GameFacetCounts {
  const counts: GameFacetCounts = { kind: {}, status: {}, platform: {}, collection: {} };
  const bump = (into: Record<string, number>, key: string) => void (into[key] = (into[key] ?? 0) + 1);
  for (const game of games) {
    if (passes(game, filters, "kind")) {
      bump(counts.kind, "all");
      bump(counts.kind, is_dlc(game) ? "dlc" : "games");
    }
    if (passes(game, filters, "status")) {
      bump(counts.status, "all");
      bump(counts.status, game.status);
    }
    if (passes(game, filters, "platform")) {
      bump(counts.platform, "all");
      if (game.owned_platforms.length === 0) bump(counts.platform, "none");
      for (const platform of game.owned_platforms) bump(counts.platform, platform);
    }
    if (passes(game, filters, "collection")) {
      bump(counts.collection, "all");
      if (game.collection_ids.length === 0) bump(counts.collection, "none");
      for (const id of game.collection_ids) bump(counts.collection, id);
    }
  }
  return counts;
}

// Every platform any game is owned on, A-Z, for the library's filter.
export function owned_platforms_of(games: LibraryGame[]): string[] {
  return clean_names(games.flatMap((game) => game.owned_platforms)).sort((first, second) => first.localeCompare(second));
}

// ── Days ─────────────────────────────────────────────────────────────────────

// A release date, which catalogues give as a whole day, a month, a year or words, as the earliest day it could mean.
export function release_day(value: string): string {
  const text = value.trim();
  const iso = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(text);
  if (iso) return `${iso[1]}-${iso[2] ?? "01"}-${iso[3] ?? "01"}`;
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return "";
  const date = new Date(parsed);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// A Unix time in seconds as the local day it fell on, or "" for none.
export function day_of_unix(seconds: number): string {
  if (!seconds) return "";
  const date = new Date(seconds * 1000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
