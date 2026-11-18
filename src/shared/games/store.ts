// The games: every game tracked, with its status, rating, review, owned platforms, edition, playtime and collections.
// RAWG, MobyGames, Giant Bomb, Wikidata and Steam fill in what games are, with Wikidata linking their ids; a Steam
// profile's library and wishlist come in by hand or on a schedule, and the Trilium Game Tracker's library and IGDB's
// lists by their files.

// ── Imports ──────────────────────────────────────────────────────────────────

import { today } from "@x-tech-laboratories/x-libs/dates";
import { and, asc, eq, inArray, or, synced_tables } from "@x-tech-laboratories/x-libs/drizzle";
import { in_transaction, type SqlDatabase } from "@x-tech-laboratories/x-libs/sql";

import { Background, define_feature, drizzle_of, new_id } from "../feature.ts";
import { games_api } from "./api.ts";
import { catalog_labels, empty_game, join_results, merge_games, same_game, title_words, type CatalogGame } from "./catalog.ts";
import { create_giantbomb } from "./giantbomb.ts";
import { read_igdb_export, type IgdbGame } from "./igdb_export.ts";
import { migrations } from "./migrations/index.ts";
import { create_mobygames } from "./mobygames.ts";
import {
  clean_names,
  game_id_keys,
  game_key,
  is_game_status,
  not_dlc,
  parse_game_link,
  parse_giantbomb_id,
  parse_wikidata_id,
  type GameCollection,
  type GameIds,
  type GameSource,
  type GameStatus,
  type LibraryGame,
} from "./model.ts";
import { create_rawg } from "./rawg.ts";
import { games_collections, games_game_collections, games_games, games_tables } from "./schema.ts";
import { games_secret_settings, games_setting_defaults } from "./settings.ts";
import { create_steam, parse_steam_id, parse_steam_name, steam_cover, type OwnedGame, type WishedGame } from "./steam.ts";
import { read_trilium_games, read_trilium_statuses, type ImportedGame } from "./trilium.ts";
import { create_wikidata } from "./wikidata.ts";

// ── Shapes ───────────────────────────────────────────────────────────────────

export interface Games {
  games: LibraryGame[];
  collections: GameCollection[];
}

export interface GameSearchResult extends CatalogGame {
  // The library's game with any of the same ids, or the same title and year, or "" when it is not tracked.
  tracked_id: string;
}

export interface GameSearch {
  results: GameSearchResult[];
  // Catalogues that failed or were left out, by name with why, such as "RAWG: refused the key".
  failures: string[];
}

export interface AddedGame {
  id: string;
  title: string;
  existed: boolean;
}

export interface GameImportReport {
  added: number;
  updated: number;
}

export interface WishlistReport extends GameImportReport {
  // Games that left the wishlist, so left the Steam wishlist collection.
  removed: number;
}

export interface SteamSync {
  ran_at: string;
  library: GameImportReport | null;
  wishlist: WishlistReport | null;
  failures: string[];
}

export interface GamesRefreshReport {
  total: number;
  updated: number;
  failed: number;
}

export interface GamesRefresh {
  state: "none" | "running" | "done" | "failed";
  done: number;
  total: number;
  started_at: string;
  finished_at: string;
  report: GamesRefreshReport | null;
  error: string;
}

// ── Settings ─────────────────────────────────────────────────────────────────

type GamesSetting = keyof typeof games_setting_defaults;

export function games_setting<Key extends GamesSetting>(database: SqlDatabase, key: Key): (typeof games_setting_defaults)[Key] {
  const row = database.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row ? JSON.parse(row.value) : games_setting_defaults[key];
}

function set_games_setting(database: SqlDatabase, key: GamesSetting, value: unknown): void {
  database.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(key, JSON.stringify(value));
}

// The catalogues with a key set; Wikidata and Steam's store always.
function catalogs_of(database: SqlDatabase) {
  const key = (setting: GamesSetting) => String(games_setting(database, setting)).trim();
  return {
    rawg: key("games.rawg_api_key") ? create_rawg(key("games.rawg_api_key")) : null,
    mobygames: key("games.mobygames_api_key") ? create_mobygames(key("games.mobygames_api_key")) : null,
    giantbomb: key("games.giantbomb_api_key") ? create_giantbomb(key("games.giantbomb_api_key")) : null,
    wikidata: create_wikidata(),
    steam: create_steam(),
  };
}

const key_settings: Partial<Record<GameSource, [GamesSetting, string]>> = {
  rawg: ["games.rawg_api_key", "RAWG"],
  mobygames: ["games.mobygames_api_key", "MobyGames"],
  giantbomb: ["games.giantbomb_api_key", "Giant Bomb"],
};

// The key and the profile as set: its 64-bit id, its custom URL name, or a link to either.
function steam_settings(database: SqlDatabase): { key: string; profile: string } {
  const key = String(games_setting(database, "games.steam_api_key")).trim();
  const profile = String(games_setting(database, "games.steam_id")).trim();
  if (!key || !(parse_steam_id(profile) || parse_steam_name(profile))) throw new Error("Set a Steam Web API key and your Steam profile in Settings → Games first.");
  return { key, profile };
}

// A custom URL name is turned into the profile's 64-bit id by asking Steam.
async function steam_account(database: SqlDatabase): Promise<{ key: string; steam_id: string }> {
  const { key, profile } = steam_settings(database);
  return { key, steam_id: parse_steam_id(profile) || (await create_steam().profile_id(key, parse_steam_name(profile))) };
}

// How many games a refresh asks the catalogues about at once.
const refresh_concurrency = 4;

const hour_in_milliseconds = 60 * 60 * 1000;

export const steam_wishlist_collection = "Steam wishlist";

const steam_platform = "PC";

// ── Reading ──────────────────────────────────────────────────────────────────

function parse_list(text: string): string[] {
  try {
    const parsed: unknown = text ? JSON.parse(text) : [];
    return Array.isArray(parsed) ? clean_names(parsed.map(String)) : [];
  } catch {
    return [];
  }
}

export function list_games(database: SqlDatabase, ids?: string[]): LibraryGame[] {
  const db = drizzle_of(database);
  const rows = ids ? db.select().from(games_games).where(inArray(games_games.id, ids)).all() : db.select().from(games_games).orderBy(asc(games_games.title)).all();
  const collections_of = new Map<string, string[]>();
  for (const link of db.select().from(games_game_collections).all()) collections_of.set(link.game_id, [...(collections_of.get(link.game_id) ?? []), link.collection_id]);
  return rows.map((row) => ({
    ...row,
    status: is_game_status(row.status) ? row.status : "want_to_play",
    owned_platforms: parse_list(row.owned_platforms),
    collection_ids: collections_of.get(row.id) ?? [],
  }));
}

export function require_game(database: SqlDatabase, id: string): LibraryGame {
  const [game] = list_games(database, [id]);
  if (!game) throw new Error("That game is not in the library.");
  return game;
}

// The library's game with any of the ids given, so catalogues that know a game by different ids land on one row.
export function find_game(database: SqlDatabase, ids: Partial<GameIds>): string {
  const db = drizzle_of(database);
  const key = game_key(ids);
  if (key && db.select({ id: games_games.id }).from(games_games).where(eq(games_games.id, key)).get()) return key;
  const matches = game_id_keys.flatMap((column) => (ids[column] ? [eq(games_games[column], ids[column])] : []));
  if (matches.length === 0) return "";
  return db.select({ id: games_games.id }).from(games_games).where(or(...matches)).get()?.id ?? "";
}

// A game with no catalogue id, such as one imported by title alone, found by its title and year.
function find_by_title(database: SqlDatabase, title: string, year: string): string {
  const words = title_words(title);
  const rows = drizzle_of(database).select({ id: games_games.id, title: games_games.title, year: games_games.year }).from(games_games).all();
  return rows.find((row) => title_words(row.title) === words && (!year || !row.year || row.year === year))?.id ?? "";
}

// ── Catalogues ───────────────────────────────────────────────────────────────

// Text and pictures come from the richest catalogue first; Wikidata, asked first for its links, is the last resort.
const detail_order: GameSource[] = ["rawg", "mobygames", "giantbomb", "steam", "wikidata"];

function ids_only(game: CatalogGame): CatalogGame {
  const ids = Object.fromEntries(game_id_keys.map((key) => [key, game[key]]));
  return { ...empty_game(game.sources[0] ?? "wikidata"), ...ids };
}

// What every catalogue that knows the game says: Wikidata first, for the ids the others know it by, then each catalogue
// with a key by its own id. Each may fail alone, and the game is refused only when none answered.
async function gather(database: SqlDatabase, start: CatalogGame): Promise<CatalogGame> {
  const catalogs = catalogs_of(database);
  const answers: Partial<Record<GameSource, CatalogGame>> = {};
  const failures: string[] = [];
  let ids = ids_only(start);
  const ask = async (source: GameSource, lookup: () => Promise<CatalogGame>) => {
    try {
      answers[source] = await lookup();
      ids = merge_games(ids, ids_only(answers[source]!));
    } catch (error) {
      failures.push(`${catalog_labels[source]}: ${(error as Error).message}`);
    }
  };
  if (!ids.wikidata_id) {
    const item = await catalogs.wikidata.find(ids).catch(() => "");
    if (item) ids.wikidata_id = item;
  }
  if (ids.wikidata_id) await ask("wikidata", () => catalogs.wikidata.game(ids.wikidata_id));
  const { rawg, mobygames, giantbomb, steam } = catalogs;
  await Promise.all([
    rawg && ids.rawg_id ? ask("rawg", () => rawg.game(ids.rawg_id)) : undefined,
    mobygames && ids.mobygames_id ? ask("mobygames", () => mobygames.game(ids.mobygames_id)) : undefined,
    giantbomb && ids.giantbomb_id ? ask("giantbomb", () => giantbomb.game(ids.giantbomb_id)) : undefined,
    ids.steam_app_id ? ask("steam", () => steam.game(ids.steam_app_id)) : undefined,
  ]);
  const answered = detail_order.flatMap((source) => (answers[source] ? [answers[source]!] : []));
  if (answered.length === 0 && !start.title) throw new Error(failures.join("; ") || "No catalogue knows that game.");
  // The ids asked by win over any a catalogue gives, so an id set by hand stays.
  let game = ids_only(start);
  for (const answer of answered) game = merge_games(game, answer);
  return merge_games(merge_games(game, ids), start);
}

// Steam's own art replaces a cover that is only the usual guess at its address, and never box art from elsewhere.
function steam_art(cover_url: string, game: { app_id: string; cover_url: string }): string {
  return game.cover_url && (!cover_url || cover_url === steam_cover(game.app_id)) ? game.cover_url : cover_url;
}

// Box art, else Steam's library art for a game Steam sells, else a wide picture.
function cover_of(game: CatalogGame): string {
  return game.cover_url || steam_cover(game.steam_app_id) || game.banner_url;
}

function metadata_of(game: CatalogGame) {
  return {
    ...Object.fromEntries(game_id_keys.map((key) => [key, game[key]])),
    title: game.title,
    year: game.year,
    release_date: game.release_date,
    overview: game.overview,
    cover_url: cover_of(game),
    genres: game.genres,
    platforms: game.platforms,
    developers: game.developers,
    publishers: game.publishers,
  };
}

// The game a catalogue says this is DLC of, unless one is already set, by hand or before.
function base_of(row: { base_game: string } | undefined, game: CatalogGame) {
  return !row?.base_game && game.base_game ? { base_game: game.base_game, base_game_title: game.base_game_title } : {};
}

// What the catalogues say replaces what was there; a value they no longer give is kept.
function keep_known(row: Record<string, unknown>, fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value === "" ? row[key] : value]));
}

// A game already tracked keeps its status, rating, platforms and notes; only what the catalogues say of it changes.
function write_details(database: SqlDatabase, game: CatalogGame): AddedGame {
  const db = drizzle_of(database);
  const fields = metadata_of(game);
  const existing = find_game(database, game);
  if (existing) {
    const row = db.select().from(games_games).where(eq(games_games.id, existing)).get()!;
    db.update(games_games)
      .set({ ...keep_known(row, fields), ...base_of(row, game) })
      .where(eq(games_games.id, existing))
      .run();
    return { id: existing, title: game.title, existed: true };
  }
  const id = game_key(game);
  if (!id) throw new Error("That game has no RAWG, MobyGames, Giant Bomb, Wikidata or Steam id.");
  const status = games_setting(database, "games.default_status");
  db.insert(games_games)
    .values({ id, ...fields, ...base_of(undefined, game), title: game.title || "Untitled game", status: is_game_status(status) ? status : "want_to_play", added_at: today() })
    .run();
  return { id, title: game.title, existed: false };
}

function start_from(source: GameSource, id: string): CatalogGame {
  const start = empty_game(source);
  if (source === "rawg") start.rawg_id = id.toLowerCase();
  else if (source === "mobygames") start.mobygames_id = /^\d+$/.test(id) ? id : "";
  else if (source === "giantbomb") start.giantbomb_id = parse_giantbomb_id(id);
  else if (source === "wikidata") start.wikidata_id = parse_wikidata_id(id);
  else start.steam_app_id = /^\d+$/.test(id) ? id : "";
  if (!game_key(start)) throw new Error(`${id} is not a ${catalog_labels[source]} id.`);
  return start;
}

async function add_from(database: SqlDatabase, source: GameSource, id: string): Promise<AddedGame> {
  return write_details(database, await gather(database, start_from(source, id.trim())));
}

// Every catalogue searched at once; one failing, or left out for want of a key, leaves the others' answers.
async function search_everywhere(database: SqlDatabase, query: string): Promise<GameSearch> {
  const catalogs = catalogs_of(database);
  const searches: [GameSource, Promise<CatalogGame[]>][] = [];
  const failures: string[] = [];
  for (const source of ["rawg", "mobygames", "giantbomb"] as const) {
    const client = catalogs[source];
    if (client) searches.push([source, client.search(query)]);
    else failures.push(`${key_settings[source]![1]}: no key set`);
  }
  searches.push(["steam", catalogs.steam.search(query)], ["wikidata", catalogs.wikidata.search(query)]);
  const settled = await Promise.allSettled(searches.map(([, search]) => search));
  failures.push(...settled.flatMap((result, index) => (result.status === "rejected" ? [`${catalog_labels[searches[index]![0]]}: ${(result.reason as Error).message}`] : [])));
  if (settled.every((result) => result.status === "rejected")) throw new Error(failures.join("; "));
  const lists = settled.map((result) => (result.status === "fulfilled" ? result.value : []));
  const results = join_results(lists).map((game) => ({ ...game, cover_url: cover_of(game), tracked_id: find_game(database, game) || find_by_title(database, game.title, game.year) }));
  return { results, failures };
}

// ── Collections ──────────────────────────────────────────────────────────────

function collection_named(database: SqlDatabase, name: string): string {
  const db = drizzle_of(database);
  const found = db
    .select()
    .from(games_collections)
    .all()
    .find((collection) => collection.name.toLowerCase() === name.toLowerCase());
  if (found) return found.id;
  const id = new_id();
  db.insert(games_collections).values({ id, name }).run();
  return id;
}

function add_to_collection(database: SqlDatabase, game_id: string, collection_id: string): void {
  drizzle_of(database).insert(games_game_collections).values({ game_id, collection_id }).onConflictDoNothing().run();
}

// ── Steam ────────────────────────────────────────────────────────────────────

function later_day(first: string, second: string): string {
  return first > second ? first : second;
}

function with_platform(text: string, platform: string): string {
  return JSON.stringify(clean_names([...parse_list(text), platform]));
}

// Steam's playtime and last day played replace older ones, a game played moves on from Want to play, and every game
// it lists is owned on PC.
function import_owned(database: SqlDatabase, owned: OwnedGame[]): GameImportReport {
  const db = drizzle_of(database);
  const report: GameImportReport = { added: 0, updated: 0 };
  for (const game of owned) {
    if (!game.app_id) continue;
    const existing = find_game(database, { steam_app_id: game.app_id });
    if (existing) {
      const row = db.select().from(games_games).where(eq(games_games.id, existing)).get()!;
      db.update(games_games)
        .set({
          playtime_minutes: Math.max(row.playtime_minutes, game.playtime_minutes),
          last_played: later_day(row.last_played, game.last_played),
          status: row.status === "want_to_play" && game.playtime_minutes > 0 ? "playing" : row.status,
          owned_platforms: with_platform(row.owned_platforms, steam_platform),
          cover_url: steam_art(row.cover_url, game),
        })
        .where(eq(games_games.id, existing))
        .run();
      report.updated++;
      continue;
    }
    db.insert(games_games)
      .values({
        id: game_key({ steam_app_id: game.app_id }),
        steam_app_id: game.app_id,
        title: game.title || `Steam app ${game.app_id}`,
        cover_url: game.cover_url,
        status: game.playtime_minutes > 0 ? "playing" : "want_to_play",
        owned_platforms: JSON.stringify([steam_platform]),
        playtime_minutes: game.playtime_minutes,
        last_played: game.last_played,
        added_at: today(),
      })
      .run();
    report.added++;
  }
  return report;
}

// Wished games not yet tracked come in as Want to play; the Steam wishlist collection then holds exactly the wishlist.
function import_wished(database: SqlDatabase, wished: WishedGame[]): WishlistReport {
  const db = drizzle_of(database);
  const report: WishlistReport = { added: 0, updated: 0, removed: 0 };
  const collection_id = collection_named(database, steam_wishlist_collection);
  const kept = new Set<string>();
  for (const game of wished) {
    let id = find_game(database, { steam_app_id: game.app_id });
    if (id) {
      const row = db.select({ cover_url: games_games.cover_url }).from(games_games).where(eq(games_games.id, id)).get()!;
      db.update(games_games).set({ cover_url: steam_art(row.cover_url, game) }).where(eq(games_games.id, id)).run();
      report.updated++;
    } else {
      id = game_key({ steam_app_id: game.app_id });
      db.insert(games_games)
        .values({
          id,
          steam_app_id: game.app_id,
          title: game.title || `Steam app ${game.app_id}`,
          year: game.release_date.slice(0, 4),
          release_date: game.release_date,
          cover_url: game.cover_url,
          status: "want_to_play",
          added_at: today(),
        })
        .run();
      report.added++;
    }
    add_to_collection(database, id, collection_id);
    kept.add(id);
  }
  for (const { game_id } of db.select({ game_id: games_game_collections.game_id }).from(games_game_collections).where(eq(games_game_collections.collection_id, collection_id)).all()) {
    if (kept.has(game_id)) continue;
    db.delete(games_game_collections)
      .where(and(eq(games_game_collections.game_id, game_id), eq(games_game_collections.collection_id, collection_id)))
      .run();
    report.removed++;
  }
  return report;
}

async function import_library(database: SqlDatabase): Promise<GameImportReport> {
  const { key, steam_id } = await steam_account(database);
  const owned = await create_steam().owned(key, steam_id);
  return in_transaction(database, () => import_owned(database, owned));
}

async function import_wishlist(database: SqlDatabase): Promise<WishlistReport> {
  const { key, steam_id } = await steam_account(database);
  const wished = await create_steam().wishlist(key, steam_id);
  return in_transaction(database, () => import_wished(database, wished));
}

async function sync_steam(database: SqlDatabase): Promise<SteamSync> {
  const sync: SteamSync = { ran_at: new Date().toISOString(), library: null, wishlist: null, failures: [] };
  try {
    sync.library = await import_library(database);
  } catch (error) {
    sync.failures.push(`Library: ${(error as Error).message}`);
  }
  try {
    sync.wishlist = await import_wishlist(database);
  } catch (error) {
    sync.failures.push(`Wishlist: ${(error as Error).message}`);
  }
  const said = [
    sync.library && `library ${sync.library.added} added, ${sync.library.updated} updated`,
    sync.wishlist && `wishlist ${sync.wishlist.added} added, ${sync.wishlist.removed} left`,
    ...sync.failures,
  ].filter(Boolean);
  set_games_setting(database, "games.last_steam_sync", sync.ran_at);
  set_games_setting(database, "games.last_steam_result", said.join("; "));
  return sync;
}

// ── Trilium ──────────────────────────────────────────────────────────────────

// A new game whole; one already here gains the playtime, days, rating and collections it lacks, and moves on from Want to play.
function import_trilium_game(database: SqlDatabase, game: ImportedGame): "added" | "updated" {
  const db = drizzle_of(database);
  const ids = { steam_app_id: game.steam_app_id, igdb_id: game.igdb_id };
  const existing = find_game(database, ids) || find_by_title(database, game.title, game.year);
  let id = existing;
  if (existing) {
    const row = db.select().from(games_games).where(eq(games_games.id, existing)).get()!;
    db.update(games_games)
      .set({
        steam_app_id: row.steam_app_id || game.steam_app_id,
        igdb_id: row.igdb_id || game.igdb_id,
        status: row.status === "want_to_play" ? game.status : row.status,
        rating: row.rating ?? game.rating,
        playtime_minutes: Math.max(row.playtime_minutes, game.playtime_minutes),
        last_played: later_day(row.last_played, game.last_played),
        added_at: row.added_at && game.added_at ? (row.added_at < game.added_at ? row.added_at : game.added_at) : row.added_at || game.added_at,
      })
      .where(eq(games_games.id, existing))
      .run();
  } else {
    id = game_key(ids) || `title:${title_words(game.title)}${game.year ? `/${game.year}` : ""}`;
    db.insert(games_games)
      .values({
        id,
        ...ids,
        title: game.title,
        year: game.year,
        overview: game.overview,
        cover_url: game.cover_url || steam_cover(game.steam_app_id),
        genres: game.genres,
        platforms: game.platforms,
        status: game.status,
        rating: game.rating,
        owned_platforms: game.steam_app_id ? JSON.stringify([steam_platform]) : "[]",
        playtime_minutes: game.playtime_minutes,
        last_played: game.last_played,
        added_at: game.added_at || today(),
      })
      .run();
  }
  for (const name of game.collections) add_to_collection(database, id, collection_named(database, name));
  return existing ? "updated" : "added";
}

// ── IGDB ─────────────────────────────────────────────────────────────────────

// IGDB's export names games only by title: one already here, matched by title, gains the status, rating, review,
// platforms and collections it lacks; a new one waits for Refresh to find it on Wikidata by its title.
function import_igdb_game(database: SqlDatabase, game: IgdbGame): "added" | "updated" {
  const db = drizzle_of(database);
  const existing = find_by_title(database, game.title, "");
  let id = existing;
  if (existing) {
    const row = db.select().from(games_games).where(eq(games_games.id, existing)).get()!;
    db.update(games_games)
      .set({
        status: row.status === "want_to_play" ? game.status : row.status,
        rating: row.rating ?? game.rating,
        review: row.review || game.review,
        owned_platforms: JSON.stringify(clean_names([...parse_list(row.owned_platforms), ...game.platforms])),
      })
      .where(eq(games_games.id, existing))
      .run();
  } else {
    id = `title:${title_words(game.title)}`;
    db.insert(games_games)
      .values({ id, title: game.title, status: game.status, rating: game.rating, review: game.review, owned_platforms: JSON.stringify(game.platforms), added_at: today() })
      .run();
  }
  for (const name of game.collections) add_to_collection(database, id, collection_named(database, name));
  return existing ? "updated" : "added";
}

// ── Ids ──────────────────────────────────────────────────────────────────────

const id_labels: Record<keyof GameIds, string> = {
  rawg_id: "RAWG id",
  mobygames_id: "MobyGames id",
  giantbomb_id: "Giant Bomb id",
  wikidata_id: "Wikidata item",
  steam_app_id: "Steam app id",
  igdb_id: "IGDB id",
};

// Each id typed or pasted as its catalogue writes it, or as a link; empty clears it.
function clean_ids(ids: Partial<GameIds>): Partial<GameIds> {
  const cleaned: Partial<GameIds> = {};
  const refuse = (key: keyof GameIds, example: string) => new Error(`${ids[key]} is not a ${id_labels[key]}, such as ${example}.`);
  const clean = (key: keyof GameIds, parse: (input: string) => string, example: string) => {
    const input = ids[key];
    if (input === undefined) return;
    cleaned[key] = input.trim() ? parse(input.trim()) : "";
    if (input.trim() && !cleaned[key]) throw refuse(key, example);
  };
  const link_id = (source: GameSource) => (input: string) => {
    const link = parse_game_link(input);
    return link?.source === source ? link.id : "";
  };
  clean("rawg_id", (input) => link_id("rawg")(input) || (/^[a-z0-9-]+$/i.test(input) ? input.toLowerCase() : ""), "portal-2");
  clean("mobygames_id", (input) => link_id("mobygames")(input) || (/^\d+$/.test(input) ? input : ""), "51233");
  clean("giantbomb_id", parse_giantbomb_id, "3030-21662");
  clean("wikidata_id", parse_wikidata_id, "Q279446");
  clean("steam_app_id", (input) => link_id("steam")(input) || (/^\d+$/.test(input) ? input : ""), "620");
  clean("igdb_id", (input) => /igdb\.com\/games\/([a-z0-9-]+)/i.exec(input)?.[1]?.toLowerCase() ?? (/^[a-z0-9-]+$/i.test(input) ? input.toLowerCase() : ""), "portal-2");
  return cleaned;
}

// The game keeps its own id and everything about it; only the catalogue ids change, and then its details are fetched again.
async function set_ids(database: SqlDatabase, id: string, ids: Partial<GameIds>): Promise<LibraryGame> {
  require_game(database, id);
  const cleaned = clean_ids(ids);
  const db = drizzle_of(database);
  in_transaction(database, () => {
    for (const [key, value] of Object.entries(cleaned) as [keyof GameIds, string][]) {
      if (!value) continue;
      const other = db.select({ id: games_games.id, title: games_games.title }).from(games_games).where(eq(games_games[key], value)).all().find((row) => row.id !== id);
      if (other) throw new Error(`${other.title} already has that ${id_labels[key]}; remove one of the two games first.`);
    }
    db.update(games_games).set(cleaned).where(eq(games_games.id, id)).run();
  });
  await refresh_game(database, require_game(database, id)).catch(() => false);
  return require_game(database, id);
}

// ── Refreshing ───────────────────────────────────────────────────────────────

const no_refresh: GamesRefresh = { state: "none", done: 0, total: 0, started_at: "", finished_at: "", report: null, error: "" };
const refreshes = new WeakMap<SqlDatabase, GamesRefresh>();
const running_work = new WeakMap<SqlDatabase, Promise<void>>();

function snapshot_of(refresh: GamesRefresh): GamesRefresh {
  return { ...refresh, report: refresh.report && { ...refresh.report } };
}

// A game known only by its title, such as one imported without a Steam id, is first looked for on Wikidata.
async function refresh_game(database: SqlDatabase, game: LibraryGame): Promise<boolean> {
  let start: CatalogGame = { ...empty_game("wikidata"), ...Object.fromEntries(game_id_keys.map((key) => [key, game[key]])) };
  if (!game_key(start)) {
    const candidate: CatalogGame = { ...empty_game("wikidata"), title: game.title, year: game.year };
    const match = (await create_wikidata().search(game.title)).find((found) => same_game(found, candidate));
    if (!match) return false;
    start = ids_only(match);
  }
  const details = await gather(database, start);
  const db = drizzle_of(database);
  const row = db.select().from(games_games).where(eq(games_games.id, game.id)).get();
  if (!row) return false;
  // Ids another tracked game already has stay off this one, so two rows never claim one game.
  const fields = keep_known(row, metadata_of(details));
  for (const key of game_id_keys) {
    const value = fields[key];
    if (value && value !== row[key] && db.select({ id: games_games.id }).from(games_games).where(eq(games_games[key], String(value))).all().some((other) => other.id !== game.id)) fields[key] = row[key];
  }
  db.update(games_games)
    .set({ ...fields, ...base_of(row, details) })
    .where(eq(games_games.id, game.id))
    .run();
  return true;
}

async function run_refresh(database: SqlDatabase, refresh: GamesRefresh): Promise<void> {
  try {
    const games = list_games(database);
    const report: GamesRefreshReport = { total: games.length, updated: 0, failed: 0 };
    refresh.total = games.length;
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < games.length) {
        const game = games[next++]!;
        const updated = await refresh_game(database, game).catch(() => false);
        if (updated) report.updated++;
        else report.failed++;
        refresh.done++;
      }
    };
    await Promise.all(Array.from({ length: refresh_concurrency }, worker));
    Object.assign(refresh, { state: "done", report });
  } catch (error) {
    Object.assign(refresh, { state: "failed", error: (error as Error).message });
  }
  refresh.finished_at = new Date().toISOString();
}

// ── Feature ──────────────────────────────────────────────────────────────────

function require_day(day: string, what: string): void {
  if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`${what} is a day such as 2026-11-10, or empty.`);
}

function update_game(database: SqlDatabase, id: string, fields: Partial<typeof games_games.$inferInsert>): void {
  require_game(database, id);
  drizzle_of(database).update(games_games).set(fields).where(eq(games_games.id, id)).run();
}

export const games_feature = define_feature({
  id: "games",
  migrations: migrations.map((migration) => migration.statements),
  tables: synced_tables(games_tables),
  setting_defaults: games_setting_defaults,
  secret_settings: games_secret_settings,
  methods: {
    list_games: (database: SqlDatabase): Games => ({
      games: list_games(database),
      collections: drizzle_of(database).select().from(games_collections).orderBy(asc(games_collections.name)).all(),
    }),

    get_game: (database: SqlDatabase, id: string): LibraryGame | null => list_games(database, [id])[0] ?? null,

    search_games: (database: SqlDatabase, query: string): Promise<GameSearch> => search_everywhere(database, query),

    add_game: (database: SqlDatabase, source: GameSource, id: string): Promise<AddedGame> => add_from(database, source, id),

    add_game_from_link: (database: SqlDatabase, link: string): Promise<AddedGame> => {
      const parsed = parse_game_link(link);
      if (!parsed) throw new Error("Not a RAWG, MobyGames, Giant Bomb, Wikidata or Steam store link, such as https://rawg.io/games/portal-2 or https://store.steampowered.com/app/620/.");
      return add_from(database, parsed.source, parsed.id);
    },

    set_game_ids: (database: SqlDatabase, id: string, ids: Partial<GameIds>): Promise<LibraryGame> => set_ids(database, id, ids),

    set_game_base: (database: SqlDatabase, id: string, base_id: string): void => {
      require_game(database, id);
      if (!base_id) return update_game(database, id, { base_game: not_dlc, base_game_title: "" });
      if (base_id === id) throw new Error("A game cannot be DLC of itself.");
      const base = require_game(database, base_id);
      update_game(database, id, { base_game: base.id, base_game_title: base.title });
    },

    remove_game: (database: SqlDatabase, id: string): void => {
      require_game(database, id);
      drizzle_of(database).delete(games_games).where(eq(games_games.id, id)).run();
    },

    set_game_status: (database: SqlDatabase, id: string, status: GameStatus): void => {
      if (!is_game_status(status)) throw new Error(`Unknown status: ${String(status)}.`);
      update_game(database, id, { status });
    },

    set_game_rating: (database: SqlDatabase, id: string, rating: number | null): void => {
      if (rating !== null && !(Number.isFinite(rating) && rating >= 0 && rating <= 10)) throw new Error("A rating is 1 to 10, or none.");
      update_game(database, id, { rating: rating ? Math.round(rating) : null });
    },

    set_game_review: (database: SqlDatabase, id: string, review: string): void => update_game(database, id, { review: review.trim() }),

    set_game_platforms: (database: SqlDatabase, id: string, platforms: string[]): void => {
      if (!Array.isArray(platforms)) throw new Error("Platforms are a list of names, such as PC or Nintendo Switch.");
      update_game(database, id, { owned_platforms: JSON.stringify(clean_names(platforms.map(String))) });
    },

    set_game_edition: (database: SqlDatabase, id: string, edition: string): void => update_game(database, id, { edition: edition.trim() }),

    set_game_playtime: (database: SqlDatabase, id: string, minutes: number): void => {
      if (!(Number.isFinite(minutes) && minutes >= 0)) throw new Error("Playtime is a number of minutes from 0 up.");
      update_game(database, id, { playtime_minutes: Math.round(minutes) });
    },

    set_game_last_played: (database: SqlDatabase, id: string, day: string): void => {
      require_day(day, "The day last played");
      update_game(database, id, { last_played: day });
    },

    set_game_collections: (database: SqlDatabase, id: string, collection_ids: string[]): void => {
      require_game(database, id);
      in_transaction(database, () => {
        const db = drizzle_of(database);
        db.delete(games_game_collections).where(eq(games_game_collections.game_id, id)).run();
        for (const collection_id of new Set(collection_ids)) db.insert(games_game_collections).values({ game_id: id, collection_id }).run();
      });
    },

    // Adds a collection or renames one; a name already in use, whatever its case, merges the two.
    save_game_collection: (database: SqlDatabase, collection: { id?: string; name: string }): string => {
      const name = collection.name.trim();
      if (!name) throw new Error("A collection needs a name.");
      return in_transaction(database, () => {
        const db = drizzle_of(database);
        const same_name = db
          .select()
          .from(games_collections)
          .all()
          .find((other) => other.name.toLowerCase() === name.toLowerCase() && other.id !== collection.id);
        if (!collection.id) return same_name?.id ?? collection_named(database, name);
        if (same_name) {
          const games = db.select({ game_id: games_game_collections.game_id }).from(games_game_collections).where(eq(games_game_collections.collection_id, collection.id)).all();
          for (const { game_id } of games) add_to_collection(database, game_id, same_name.id);
          db.delete(games_collections).where(eq(games_collections.id, collection.id)).run();
          return same_name.id;
        }
        db.update(games_collections).set({ name }).where(eq(games_collections.id, collection.id)).run();
        return collection.id;
      });
    },

    // Its games stay; they only lose the collection.
    remove_game_collection: (database: SqlDatabase, id: string): void => void drizzle_of(database).delete(games_collections).where(eq(games_collections.id, id)).run(),

    import_steam_library: (database: SqlDatabase): Promise<GameImportReport> => import_library(database),

    import_steam_wishlist: (database: SqlDatabase): Promise<WishlistReport> => import_wishlist(database),

    // Imports the Steam library and wishlist when the hours set have passed, or now when forced; gives what it did, or
    // null when it was not due or no Steam account is set.
    run_steam_sync: async (database: SqlDatabase, force: boolean): Promise<SteamSync | null> => {
      const hours = Number(games_setting(database, "games.steam_sync_hours"));
      if (!force && !(hours > 0)) return null;
      const last = Date.parse(String(games_setting(database, "games.last_steam_sync")));
      if (!force && Number.isFinite(last) && Date.now() - last < hours * hour_in_milliseconds) return null;
      if (!force) {
        try {
          steam_settings(database);
        } catch {
          return null;
        }
      }
      return sync_steam(database);
    },

    // The Trilium Game Tracker's Database note, and optionally its config note for the statuses added there; adds and
    // merges, never removes.
    import_trilium_games: (database: SqlDatabase, database_json: string, config_json: string): GameImportReport => {
      const games = read_trilium_games(database_json, read_trilium_statuses(config_json));
      if (games.length === 0) throw new Error("No games found; pick the Game Tracker's Database note, saved as a .json file.");
      return in_transaction(database, () => {
        const report: GameImportReport = { added: 0, updated: 0 };
        for (const game of games) report[import_trilium_game(database, game)]++;
        return report;
      });
    },

    // IGDB's data export page; adds and merges, never removes.
    import_igdb_export: (database: SqlDatabase, html: string): GameImportReport => {
      const games = read_igdb_export(html);
      if (games.length === 0) throw new Error("No games found; pick the index.html from IGDB's data export.");
      return in_transaction(database, () => {
        const report: GameImportReport = { added: 0, updated: 0 };
        for (const game of games) report[import_igdb_game(database, game)]++;
        return report;
      });
    },

    // Starts fetching every game's details again in the background, or answers with the refresh already running.
    refresh_games: (database: SqlDatabase): Background<GamesRefresh> => {
      const running = refreshes.get(database);
      if (running?.state === "running") return new Background(snapshot_of(running), running_work.get(database)!);
      const refresh: GamesRefresh = { ...no_refresh, state: "running", started_at: new Date().toISOString() };
      refreshes.set(database, refresh);
      const work = run_refresh(database, refresh);
      running_work.set(database, work);
      return new Background(snapshot_of(refresh), work);
    },

    get_games_refresh: (database: SqlDatabase): GamesRefresh => snapshot_of(refreshes.get(database) ?? no_refresh),
  },
  api: games_api,
});
