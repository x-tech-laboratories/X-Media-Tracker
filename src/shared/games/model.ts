// What a tracked game is, and the rules on it that need no database: which ids name the same game, pasted links,
// playtime, sorting and the Games library's filters with counts.
// The page imports this file too, so it imports only other_ids.ts, which imports nothing.

import { clean_other_ids, other_key, shares_an_other_id, type OtherIds } from "../other_ids.ts";

export { clean_other_ids, type OtherIds };

// ── Games ────────────────────────────────────────────────────────────────────

// IGDB's statuses: three groups, each split into the statuses a game takes, in order from not yet played to done.
export const game_status_groups = ["want_to_play", "playing", "played"] as const;

export type GameStatusGroup = (typeof game_status_groups)[number];

export const game_status_group_labels: Record<GameStatusGroup, string> = { want_to_play: "Want to play", playing: "Playing", played: "Played" };

// A status by its id: a built-in one such as "on_hold", or one of the user's own.
export type GameStatus = string;

// One status in the user's list: its id, what it is called and the group it is in.
export interface GameStatusInfo {
  id: GameStatus;
  label: string;
  group: GameStatusGroup;
}

// The statuses every library starts with; renaming, reordering or removing them changes only the user's list.
export const built_in_statuses: readonly GameStatusInfo[] = [
  { id: "wishlist", label: "Wishlist", group: "want_to_play" },
  { id: "backlog", label: "Backlog", group: "want_to_play" },
  { id: "currently_playing", label: "Currently playing", group: "playing" },
  { id: "on_hold", label: "On hold", group: "playing" },
  { id: "endless", label: "Endless", group: "playing" },
  { id: "replaying", label: "Replaying", group: "playing" },
  { id: "finished", label: "Finished", group: "played" },
  { id: "completed", label: "Completed", group: "played" },
  { id: "abandoned", label: "Abandoned", group: "played" },
];

function is_status_group(value: unknown): value is GameStatusGroup {
  return typeof value === "string" && (game_status_groups as readonly string[]).includes(value);
}

// A stored list as statuses in group order, dropping broken or repeated entries; a group left empty gets its built-in statuses back.
export function clean_game_statuses(value: unknown): GameStatusInfo[] {
  const seen = new Set<string>();
  const kept = (Array.isArray(value) ? value : []).flatMap((entry: Partial<GameStatusInfo> | null): GameStatusInfo[] => {
    if (!entry || typeof entry.id !== "string" || !entry.id || seen.has(entry.id) || typeof entry.label !== "string" || !entry.label.trim() || !is_status_group(entry.group)) return [];
    seen.add(entry.id);
    return [{ id: entry.id, label: entry.label.trim(), group: entry.group }];
  });
  return game_status_groups.flatMap((group) => {
    const members = kept.filter((each) => each.group === group);
    return members.length > 0 ? members : built_in_statuses.filter((each) => each.group === group && !seen.has(each.id));
  });
}

export function statuses_in_group(statuses: readonly GameStatusInfo[], group: GameStatusGroup): GameStatusInfo[] {
  return statuses.filter((status) => status.group === group);
}

// The status a game takes when only its group is chosen: Backlog, Currently playing or Finished, or once that is removed the group's first.
const built_in_group_status: Record<GameStatusGroup, GameStatus> = { want_to_play: "backlog", playing: "currently_playing", played: "finished" };

export function group_status(statuses: readonly GameStatusInfo[], group: GameStatusGroup): GameStatus {
  const members = statuses_in_group(statuses, group);
  return members.find((each) => each.id === built_in_group_status[group])?.id ?? members[0]?.id ?? built_in_group_status[group];
}

export function is_game_status(statuses: readonly GameStatusInfo[], value: unknown): value is GameStatus {
  return typeof value === "string" && statuses.some((status) => status.id === value);
}

// Statuses before IGDB's, as an older device may still sync them.
const older_statuses: Record<string, GameStatus> = { want_to_play: "backlog", playing: "currently_playing", paused: "on_hold", played: "finished", dropped: "abandoned" };

// A stored status as one in the list: a removed built-in one, or an older one, as its group's status, and anything else as Backlog's.
export function game_status_of(statuses: readonly GameStatusInfo[], value: unknown): GameStatus {
  if (is_game_status(statuses, value)) return value;
  const today = typeof value === "string" ? (older_statuses[value] ?? value) : "";
  if (is_game_status(statuses, today)) return today;
  return group_status(statuses, built_in_statuses.find((each) => each.id === today)?.group ?? "want_to_play");
}

export function game_status_info(statuses: readonly GameStatusInfo[], status: GameStatus): GameStatusInfo {
  const id = game_status_of(statuses, status);
  return statuses.find((each) => each.id === id) ?? built_in_statuses.find((each) => each.id === id)!;
}

// A status and its group, such as "Playing · On hold".
export function game_status_text(statuses: readonly GameStatusInfo[], status: GameStatus): string {
  const info = game_status_info(statuses, status);
  return `${game_status_group_labels[info.group]} · ${info.label}`;
}

// From wanting a game to having played it, so of two statuses for one game the later says more.
const game_status_rank: readonly GameStatus[] = ["backlog", "wishlist", "on_hold", "currently_playing", "endless", "replaying", "abandoned", "finished", "completed"];

// A status of the user's own ranks with its group's built-in status, such as Currently playing.
function rank_of(statuses: readonly GameStatusInfo[], status: GameStatus): number {
  const rank = game_status_rank.indexOf(status);
  return rank >= 0 ? rank : game_status_rank.indexOf(built_in_group_status[game_status_info(statuses, status).group]);
}

export function furthest_status(statuses: readonly GameStatusInfo[], first: GameStatus, second: GameStatus): GameStatus {
  return rank_of(statuses, second) > rank_of(statuses, first) ? second : first;
}

// Whether a game counts as not yet played, so an import that finds it played may move it on.
export function is_unplayed(statuses: readonly GameStatusInfo[], status: GameStatus): boolean {
  return game_status_info(statuses, status).group === "want_to_play";
}

export interface GameIds {
  rawg_id: string;
  mobygames_id: string;
  giantbomb_id: string;
  wikidata_id: string;
  steam_app_id: string;
  igdb_id: string;
  thegamesdb_id: string;
  // A GOG store page's slug, such as the_witcher_3_wild_hunt.
  gog_id: string;
  steamgriddb_id: string;
  // An itch.io game page as its creator's name and the page's slug, such as innersloth/among-us.
  itchio_id: string;
  // An Epic Games Store catalogue item id, 32 letters and digits.
  epic_id: string;
}

// New catalogues go last, so a tracked game's id, made from the first id it has, never changes.
export const game_id_keys = ["rawg_id", "mobygames_id", "giantbomb_id", "wikidata_id", "steam_app_id", "igdb_id", "thegamesdb_id", "gog_id", "steamgriddb_id", "itchio_id", "epic_id"] as const satisfies readonly (keyof GameIds)[];

// What the launchers know a game by, which never names it in the library.
export interface GameLaunchIds {
  // An Epic Games Store namespace and app name, such as Fortnite, which the Epic launcher and Heroic start a game by.
  epic_namespace: string;
  epic_app_name: string;
  // A GOG product number, such as 1207664663, which GOG Galaxy and Heroic know a game by.
  gog_product_id: string;
  // A Lutris game's slug, such as portal-2.
  lutris_slug: string;
}

export const game_launch_keys = ["epic_namespace", "epic_app_name", "gog_product_id", "lutris_slug"] as const satisfies readonly (keyof GameLaunchIds)[];

export interface Game extends GameIds, GameLaunchIds {
  id: string;
  other_ids: OtherIds;
  title: string;
  year: string;
  // The first release, such as 2011-04-18, or "".
  release_date: string;
  overview: string;
  cover_url: string;
  // The full image kept on every device, by its synced file's name, and the address it was taken from ("custom" when set by hand).
  cover_file: string;
  cover_file_from: string;
  // Whether the cover's address was set by hand, so a refresh of the catalogues leaves it.
  cover_by_hand: boolean;
  // Each as one line, such as "Action, Puzzle".
  genres: string;
  platforms: string;
  developers: string;
  publishers: string;
  status: GameStatus;
  // 1 to 10, shown as half stars out of five; null when unrated.
  rating: number | null;
  review: string;
  // Your own notes, in Markdown.
  notes: string;
  // The platforms a copy is owned on, such as ["PC", "Switch"].
  owned_platforms: string[];
  // The stores a copy is owned from, such as ["Steam", "GOG"].
  owned_stores: string[];
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

// A game as the Games library lists it: with its collections, and its status's name and group from the user's list.
export interface LibraryGame extends Game {
  collection_ids: string[];
  status_label: string;
  status_group: GameStatusGroup;
}

export interface GameCollection {
  id: string;
  name: string;
}

// ── Ids ──────────────────────────────────────────────────────────────────────

// The strongest id first: RAWG covers the most games, then the curated catalogues, then Wikidata, then a store, and
// last another catalogue's, the first by its source's name.
export function game_key(ids: Partial<GameIds> & { other_ids?: OtherIds }): string {
  for (const key of game_id_keys) {
    const value = ids[key];
    if (value) return `${key.replace(/_id$|_app_id$/, "")}:${value}`;
  }
  return other_key(ids.other_ids);
}

export function shares_a_game_id(first: Partial<GameIds> & { other_ids?: OtherIds }, second: Partial<GameIds> & { other_ids?: OtherIds }): boolean {
  return game_id_keys.some((key) => !!first[key] && first[key] === second[key]) || shares_an_other_id(first.other_ids, second.other_ids);
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

// The id each catalogue, and the Epic Games Store, knows a game by.
export const key_fields: Record<GameSource | "epic", keyof GameIds> = {
  rawg: "rawg_id",
  mobygames: "mobygames_id",
  giantbomb: "giantbomb_id",
  wikidata: "wikidata_id",
  steam: "steam_app_id",
  igdb: "igdb_id",
  thegamesdb: "thegamesdb_id",
  gog: "gog_id",
  steamgriddb: "steamgriddb_id",
  itchio: "itchio_id",
  epic: "epic_id",
};

export function is_dlc(game: Pick<Game, "base_game">): boolean {
  return !!game.base_game && game.base_game !== not_dlc;
}

// The tracked game a DLC belongs to: the one with its id, else the one with the catalogue id its key names.
export function find_base_game<Item extends Game>(game: Pick<Game, "base_game">, games: Item[]): Item | undefined {
  if (!is_dlc(game)) return undefined;
  const exact = games.find((each) => each.id === game.base_game);
  if (exact) return exact;
  const split = game.base_game.indexOf(":");
  const source = game.base_game.slice(0, split);
  const field = (key_fields as Record<string, keyof GameIds | undefined>)[source];
  if (!field && split > 0) return games.find((each) => each.other_ids?.[source] === game.base_game.slice(split + 1));
  const value = game.base_game.slice(split + 1);
  return field && value ? games.find((each) => each[field] === value) : undefined;
}

// The tracked DLC of a game, A-Z.
export function dlc_of<Item extends Game>(base: Game, games: Item[]): Item[] {
  return games.filter((each) => each.id !== base.id && find_base_game(each, [base])).sort((first, second) => first.title.localeCompare(second.title));
}

// ── Links ────────────────────────────────────────────────────────────────────

export type GameSource = "rawg" | "mobygames" | "giantbomb" | "wikidata" | "steam" | "igdb" | "thegamesdb" | "gog" | "steamgriddb" | "itchio";

export interface ParsedGameLink {
  source: GameSource;
  id: string;
}

// A GOG store page's slug, such as the_witcher_3_wild_hunt, alone or in a link, without Wikidata's leading "game/".
export function parse_gog_slug(input: string): string {
  const text = input.trim();
  const linked = /gog\.com\/(?:[a-z]{2}\/)?game\/([a-z0-9_]+)/i.exec(text);
  if (linked) return linked[1]!.toLowerCase();
  const bare = /^(?:game\/)?([a-z0-9_]+)$/i.exec(text);
  return bare && !/^\d+$/.test(bare[1]!) ? bare[1]!.toLowerCase() : "";
}

// An itch.io game page, such as innersloth/among-us, alone or as its link https://innersloth.itch.io/among-us.
export function parse_itchio_id(input: string): string {
  const text = input.trim();
  const found = /^(?:https?:\/\/)?([a-z0-9-]+)\.itch\.io\/([\w-]+)\/?(?:[?#].*)?$/i.exec(text) ?? /^([a-z0-9-]+)\/([\w-]+)$/i.exec(text);
  return found ? `${found[1]}/${found[2]}`.toLowerCase() : "";
}

// An Epic Games Store catalogue item id, 32 letters and digits.
export function parse_epic_id(input: string): string {
  const text = input.trim();
  return /^[0-9a-f]{32}$/i.test(text) ? text.toLowerCase() : "";
}

export function itchio_link(id: string): string {
  const [creator, slug] = id.split("/");
  return `https://${creator}.itch.io/${slug}`;
}

// A pasted RAWG, MobyGames, Giant Bomb, Wikidata, Steam store, IGDB, TheGamesDB, GOG or itch.io link.
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
  const igdb = /igdb\.com\/games\/([a-z0-9-]+)/i.exec(text);
  if (igdb) return { source: "igdb", id: igdb[1]!.toLowerCase() };
  const thegamesdb = /thegamesdb\.net\/game\.php\?(?:[^#\s]*&)?id=(\d+)/i.exec(text);
  if (thegamesdb) return { source: "thegamesdb", id: thegamesdb[1]! };
  if (/gog\.com\//i.test(text) && parse_gog_slug(text)) return { source: "gog", id: parse_gog_slug(text) };
  if (/\.itch\.io\//i.test(text) && parse_itchio_id(text)) return { source: "itchio", id: parse_itchio_id(text) };
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
    game.thegamesdb_id && { label: "TheGamesDB", href: `https://thegamesdb.net/game.php?id=${game.thegamesdb_id}` },
    game.gog_id && { label: "GOG", href: `https://www.gog.com/en/game/${game.gog_id}` },
    game.steamgriddb_id && { label: "SteamGridDB", href: `https://www.steamgriddb.com/game/${game.steamgriddb_id}` },
    game.itchio_id && { label: "itch.io", href: itchio_link(game.itchio_id) },
  ].filter((link): link is { label: string; href: string } => !!link);
}

// ── Platforms and playtime ───────────────────────────────────────────────────

// Platforms one may own a game on, offered first when choosing; any other name can be typed.
export const common_platforms = ["PC", "PlayStation 5", "PlayStation 4", "Xbox Series X|S", "Xbox One", "Nintendo Switch 2", "Nintendo Switch", "macOS", "Linux", "iOS", "Android"];

// Stores one may own a game from, offered first when choosing; any other name can be typed.
export const common_stores = ["Steam", "GOG", "Epic Games Store", "EA app", "Ubisoft Connect", "itch.io", "Humble Bundle", "Amazon Games", "Battle.net", "Microsoft Store", "PlayStation Store", "Nintendo eShop", "Disc"];

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

// "all" lets everything through; a platform, store or collection of "none" is games with none.
export interface GameFilters {
  search: string;
  kind: "games" | "dlc" | "all";
  // A status, a group of them, or "all".
  status: "all" | GameStatus | GameStatusGroup;
  platform: string;
  store: string;
  collection: string;
}

export const game_kind_labels: Record<GameFilters["kind"], string> = { games: "Games", dlc: "DLC", all: "Both" };

// DLC stays out of the library until asked for, as it shows on its game's page.
export const no_game_filters: GameFilters = { search: "", kind: "games", status: "all", platform: "all", store: "all", collection: "all" };

type GameFacet = keyof GameFilters;

function matches_search(game: LibraryGame, search: string): boolean {
  const words = search.toLowerCase();
  return game.title.toLowerCase().includes(words) || game.developers.toLowerCase().includes(words) || game.genres.toLowerCase().includes(words);
}

function passes(game: LibraryGame, filters: GameFilters, skip: GameFacet | null): boolean {
  if (skip !== "search" && filters.search && !matches_search(game, filters.search)) return false;
  if (skip !== "kind" && filters.kind !== "all" && is_dlc(game) !== (filters.kind === "dlc")) return false;
  if (skip !== "status" && filters.status !== "all" && game.status !== filters.status && game.status_group !== filters.status) return false;
  if (skip !== "platform" && filters.platform !== "all") {
    if (filters.platform === "none" ? game.owned_platforms.length > 0 : !game.owned_platforms.includes(filters.platform)) return false;
  }
  if (skip !== "store" && filters.store !== "all") {
    if (filters.store === "none" ? game.owned_stores.length > 0 : !game.owned_stores.includes(filters.store)) return false;
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
  const counts: GameFacetCounts = { kind: {}, status: {}, platform: {}, store: {}, collection: {} };
  const bump = (into: Record<string, number>, key: string) => void (into[key] = (into[key] ?? 0) + 1);
  for (const game of games) {
    if (passes(game, filters, "kind")) {
      bump(counts.kind, "all");
      bump(counts.kind, is_dlc(game) ? "dlc" : "games");
    }
    if (passes(game, filters, "status")) {
      bump(counts.status, "all");
      bump(counts.status, game.status_group);
      bump(counts.status, game.status);
    }
    if (passes(game, filters, "platform")) {
      bump(counts.platform, "all");
      if (game.owned_platforms.length === 0) bump(counts.platform, "none");
      for (const platform of game.owned_platforms) bump(counts.platform, platform);
    }
    if (passes(game, filters, "store")) {
      bump(counts.store, "all");
      if (game.owned_stores.length === 0) bump(counts.store, "none");
      for (const store of game.owned_stores) bump(counts.store, store);
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

// Every store any game is owned from, A-Z, for the library's filter.
export function owned_stores_of(games: LibraryGame[]): string[] {
  return clean_names(games.flatMap((game) => game.owned_stores)).sort((first, second) => first.localeCompare(second));
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
