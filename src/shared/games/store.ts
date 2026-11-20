// The games: every game tracked, with its status, rating, review, owned platforms, edition, playtime and collections.
// RAWG, IGDB, MobyGames, Giant Bomb, TheGamesDB, GOG, Wikidata, Steam and itch.io fill in what games are, with Wikidata
// linking their ids, and SteamGridDB adds art; a Steam profile's library and wishlist and an itch.io and an Epic Games
// Store account's library come in by hand or on a schedule, and IGDB's lists by its export file.

// ── Imports ──────────────────────────────────────────────────────────────────

import { today } from "@x-tech-laboratories/x-libs/dates";
import { asc, eq, inArray, or, synced_tables } from "@x-tech-laboratories/x-libs/drizzle";
import { in_transaction, type SqlDatabase } from "@x-tech-laboratories/x-libs/sql";

import { custom_cover, serves_image } from "../covers.ts";
import { Background, define_feature, drizzle_of, new_id } from "../feature.ts";
import { merge_columns, merge_ids, type SourceAnswers } from "../merging.ts";
import { move_settings_into_plugins, open_plugin_host } from "../plugins/host.ts";
import type { TransferFile, TransferInput, TransferReport } from "../transfer.ts";
import { games_api } from "./api.ts";
import { catalog_labels, cover_rank, empty_game, join_results, merge_games, same_game, title_words, type CatalogGame, type GameCatalog } from "./catalog.ts";
import { create_epic, parse_epic_code, type EpicItem, type OwnedEpicGame } from "./epic.ts";
import { read_igdb_export, type IgdbGame } from "./igdb_export.ts";
import { create_itchio, type OwnedItchGame } from "./itchio.ts";
import { migrations } from "./migrations/index.ts";
import {
  clean_game_statuses,
  clean_names,
  game_id_keys,
  game_key,
  furthest_status,
  game_status_group_labels,
  game_status_groups,
  game_status_info,
  game_status_of,
  group_status,
  is_game_status,
  is_unplayed,
  key_fields,
  not_dlc,
  parse_epic_id,
  parse_game_link,
  parse_giantbomb_id,
  parse_gog_slug,
  parse_itchio_id,
  parse_wikidata_id,
  type GameCollection,
  type GameIds,
  type GameSource,
  type GameStatus,
  type GameStatusGroup,
  type GameStatusInfo,
  type LibraryGame,
} from "./model.ts";
import { games_collections, games_game_collections, games_games, games_tables } from "./schema.ts";
import { moved_game_keys } from "./manifests.ts";
import { game_catalog_plugins } from "./plugins.ts";
import { games_secret_settings, games_setting_defaults } from "./settings.ts";
import { export_games_csv, export_games_json, import_games_file } from "./transfer.ts";
import { read_steam_categories, type SteamCategory } from "./steam_collections.ts";
import { create_steam, parse_steam_id, parse_steam_name, steam_cover, type OwnedGame, type WishedGame } from "./steam.ts";

// ── Shapes ───────────────────────────────────────────────────────────────────

export interface Games {
  games: LibraryGame[];
  collections: GameCollection[];
  // The user's statuses, in order within each group.
  statuses: GameStatusInfo[];
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

export interface SteamSync {
  ran_at: string;
  library: GameImportReport | null;
  wishlist: GameImportReport | null;
  failures: string[];
}

export interface ItchioSync {
  ran_at: string;
  library: GameImportReport | null;
  failures: string[];
}

export type EpicSync = ItchioSync;

export interface SteamCategoryReport {
  // Categories read, games whose status changed, and games in a mapped category that are not tracked.
  categories: number;
  updated: number;
  untracked: number;
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

// The user's statuses, or the built-in ones while none are set.
export function statuses_of(database: SqlDatabase): GameStatusInfo[] {
  return clean_game_statuses(games_setting(database, "games.statuses"));
}

// The catalogues whose plugins are on, in the order their searches are joined.
async function catalogs_of(database: SqlDatabase): Promise<GameCatalog[]> {
  return (await open_plugin_host(database, game_catalog_plugins)).providers("game_catalog").map((provided) => provided.value);
}

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

const pc_platform = "PC";

const steam_store = "Steam";

const itchio_store = "itch.io";

const epic_store = "Epic Games Store";

// ── Reading ──────────────────────────────────────────────────────────────────

function parse_list(text: string): string[] {
  try {
    const parsed: unknown = text ? JSON.parse(text) : [];
    return Array.isArray(parsed) ? clean_names(parsed.map(String)) : [];
  } catch {
    return [];
  }
}

function status_fields(statuses: GameStatusInfo[], stored: string): { status: GameStatus; status_label: string; status_group: GameStatusGroup } {
  const info = game_status_info(statuses, stored);
  return { status: info.id, status_label: info.label, status_group: info.group };
}

export function list_games(database: SqlDatabase, ids?: string[]): LibraryGame[] {
  const db = drizzle_of(database);
  const rows = ids ? db.select().from(games_games).where(inArray(games_games.id, ids)).all() : db.select().from(games_games).orderBy(asc(games_games.title)).all();
  const collections_of = new Map<string, string[]>();
  for (const link of db.select().from(games_game_collections).all()) collections_of.set(link.game_id, [...(collections_of.get(link.game_id) ?? []), link.collection_id]);
  const statuses = statuses_of(database);
  return rows.map((row) => ({
    ...row,
    ...status_fields(statuses, row.status),
    owned_platforms: parse_list(row.owned_platforms),
    owned_stores: parse_list(row.owned_stores),
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
export function find_by_title(database: SqlDatabase, title: string, year: string): string {
  const words = title_words(title);
  const rows = drizzle_of(database).select({ id: games_games.id, title: games_games.title, year: games_games.year }).from(games_games).all();
  return rows.find((row) => title_words(row.title) === words && (!year || !row.year || row.year === year))?.id ?? "";
}

// ── Catalogues ───────────────────────────────────────────────────────────────

// Text and pictures come from the richest catalogue first; Wikidata, asked first for its links, is the last resort.
const detail_order: GameSource[] = ["rawg", "igdb", "mobygames", "giantbomb", "thegamesdb", "gog", "steam", "itchio", "steamgriddb", "wikidata"];

function ids_only(game: CatalogGame): CatalogGame {
  const ids = Object.fromEntries(game_id_keys.map((key) => [key, game[key]]));
  return { ...empty_game(game.sources[0] ?? "wikidata"), ...ids };
}

// Each catalogue's own answer and the failures, kept for the merge window.
interface Heard {
  answers: Partial<Record<GameSource, CatalogGame>>;
  failures: string[];
}

// What every catalogue that knows the game says: Wikidata first, for the ids the others know it by, then each catalogue
// with a key by its own id, then SteamGridDB's art. Each may fail alone, and the game is refused only when none answered.
async function gather(database: SqlDatabase, start: CatalogGame, heard: Heard = { answers: {}, failures: [] }): Promise<CatalogGame> {
  const catalogs = (await catalogs_of(database)).filter((catalog) => !catalog.missing);
  const { answers, failures } = heard;
  let ids = ids_only(start);
  const ask = async (source: GameSource, lookup: () => Promise<CatalogGame>) => {
    try {
      answers[source] = await lookup();
      ids = merge_games(ids, ids_only(answers[source]!));
    } catch (error) {
      failures.push(`${catalog_labels[source]}: ${(error as Error).message}`);
    }
  };
  const heard_of = () => detail_order.flatMap((source) => (answers[source] ? [answers[source]!] : []));
  // A catalogue that can find its own id for the game looks for it first, then each is asked by its own id.
  const ask_by_own_id = async (catalog: GameCatalog, known: CatalogGame) => {
    const key = key_fields[catalog.source];
    if (!ids[key] && catalog.find) ids[key] = await catalog.find(ids, known).catch(() => "");
    if (ids[key]) await ask(catalog.source, () => catalog.game(ids[key]));
  };
  const stage = (name: GameCatalog["stage"]) => catalogs.filter((catalog) => catalog.stage === name);
  for (const catalog of stage("ids")) await ask_by_own_id(catalog, start);
  await Promise.all(stage("details").map((catalog) => ask_by_own_id(catalog, start)));
  for (const catalog of stage("art")) await ask_by_own_id(catalog, heard_of().reduce(merge_games, start));
  const answered = heard_of();
  if (answered.length === 0 && !start.title) throw new Error(failures.join("; ") || "No catalogue knows that game.");
  // The ids asked by win over any a catalogue gives, so an id set by hand stays.
  let game = ids_only(start);
  for (const answer of answered) game = merge_games(game, answer);
  return merge_games(merge_games(game, ids), start);
}

// Every catalogue's box art for a game, best first, then Steam's library art and a wide picture.
function cover_choices(game: CatalogGame, answers: CatalogGame[]): string[] {
  const others = answers.filter((answer) => answer.cover_url).sort((first, second) => cover_rank(first) - cover_rank(second));
  return [...new Set([cover_of(game), ...others.map((answer) => answer.cover_url), steam_cover(game.steam_app_id), game.banner_url])].filter(Boolean);
}

// What the catalogues say of a game, with the first cover that serves an image, so art a catalogue lists but no longer has
// gives way to the next; the address of the image already kept counts without asking, and when none answers the first stays.
async function gather_with_cover(database: SqlDatabase, start: CatalogGame, kept_from = ""): Promise<CatalogGame> {
  const heard: Heard = { answers: {}, failures: [] };
  const game = await gather(database, start, heard);
  const choices = cover_choices(game, Object.values(heard.answers));
  if (choices.length <= 1 || kept_from === custom_cover) return game;
  for (const address of choices) {
    if (address === kept_from || (await serves_image(address))) return { ...game, cover_url: address };
  }
  return game;
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

// What the catalogues say replaces what was there; a value they no longer give is kept, and so is a cover set by hand.
function keep_known(row: Record<string, unknown>, fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value === "" || (key === "cover_url" && row.cover_by_hand) ? row[key] : value]));
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
  if (!id) throw new Error("That game has no catalogue id.");
  const status = game_status_of(statuses_of(database), games_setting(database, "games.default_status"));
  db.insert(games_games)
    .values({ id, ...fields, ...base_of(undefined, game), title: game.title || "Untitled game", status, added_at: today() })
    .run();
  return { id, title: game.title, existed: false };
}

function start_from(source: GameSource, id: string): CatalogGame {
  const start = empty_game(source);
  if (source === "rawg") start.rawg_id = id.toLowerCase();
  else if (source === "mobygames") start.mobygames_id = /^\d+$/.test(id) ? id : "";
  else if (source === "giantbomb") start.giantbomb_id = parse_giantbomb_id(id);
  else if (source === "wikidata") start.wikidata_id = parse_wikidata_id(id);
  else if (source === "igdb") start.igdb_id = /^[a-z0-9-]+$/i.test(id) ? id.toLowerCase() : "";
  else if (source === "thegamesdb") start.thegamesdb_id = /^\d+$/.test(id) ? id : "";
  else if (source === "gog") start.gog_id = parse_gog_slug(id);
  else if (source === "steamgriddb") start.steamgriddb_id = /^\d+$/.test(id) ? id : "";
  else if (source === "itchio") start.itchio_id = parse_itchio_id(id);
  else start.steam_app_id = /^\d+$/.test(id) ? id : "";
  if (!game_key(start)) throw new Error(`${id} is not a ${catalog_labels[source]} id.`);
  return start;
}

async function add_from(database: SqlDatabase, source: GameSource, id: string): Promise<AddedGame> {
  return write_details(database, await gather_with_cover(database, start_from(source, id.trim())));
}

// Every catalogue searched at once; one failing, or left out for want of a key, leaves the others' answers.
async function search_everywhere(database: SqlDatabase, query: string): Promise<GameSearch> {
  const searched = (await catalogs_of(database)).filter((catalog) => catalog.search);
  const failures = searched.filter((catalog) => catalog.missing).map((catalog) => `${catalog_labels[catalog.source]}: ${catalog.missing}`);
  const searches = searched.filter((catalog) => !catalog.missing);
  if (searches.length === 0) throw new Error(failures.join("; ") || "Every catalogue is off; turn one on in Settings → Games.");
  const settled = await Promise.allSettled(searches.map((catalog) => catalog.search!(query)));
  failures.push(...settled.flatMap((result, index) => (result.status === "rejected" ? [`${catalog_labels[searches[index]!.source]}: ${(result.reason as Error).message}`] : [])));
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

// A game played moves on to Currently playing, or the Playing group's first status once that is removed.
function owned_status(statuses: GameStatusInfo[], stored: string, playtime_minutes: number): GameStatus {
  const status = game_status_of(statuses, stored);
  if (is_unplayed(statuses, status) && playtime_minutes > 0) return game_status_of(statuses, "currently_playing");
  return status === "wishlist" ? game_status_of(statuses, "backlog") : status;
}

function with_name(text: string, name: string): string {
  return JSON.stringify(clean_names([...parse_list(text), name]));
}

// Steam's playtime and last day played replace older ones, a game owned leaves the Wishlist, a game played moves on
// from Want to play, and every game it lists is owned on PC from Steam.
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
          status: owned_status(statuses_of(database), row.status, game.playtime_minutes),
          owned_platforms: with_name(row.owned_platforms, pc_platform),
          owned_stores: with_name(row.owned_stores, steam_store),
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
        status: owned_status(statuses_of(database), "backlog", game.playtime_minutes),
        owned_platforms: JSON.stringify([pc_platform]),
        owned_stores: JSON.stringify([steam_store]),
        playtime_minutes: game.playtime_minutes,
        last_played: game.last_played,
        added_at: today(),
      })
      .run();
    report.added++;
  }
  return report;
}

// Wished games not yet tracked come in as Wishlist; a tracked one keeps its status.
function import_wished(database: SqlDatabase, wished: WishedGame[]): GameImportReport {
  const db = drizzle_of(database);
  const report: GameImportReport = { added: 0, updated: 0 };
  for (const game of wished) {
    const id = find_game(database, { steam_app_id: game.app_id });
    if (id) {
      const row = db.select().from(games_games).where(eq(games_games.id, id)).get()!;
      db.update(games_games)
        .set({ cover_url: steam_art(row.cover_url, game) })
        .where(eq(games_games.id, id))
        .run();
      report.updated++;
    } else {
      db.insert(games_games)
        .values({
          id: game_key({ steam_app_id: game.app_id }),
          steam_app_id: game.app_id,
          title: game.title || `Steam app ${game.app_id}`,
          year: game.release_date.slice(0, 4),
          release_date: game.release_date,
          cover_url: game.cover_url,
          status: game_status_of(statuses_of(database), "wishlist"),
          added_at: today(),
        })
        .run();
      report.added++;
    }
  }
  return report;
}

async function import_library(database: SqlDatabase): Promise<GameImportReport> {
  const { key, steam_id } = await steam_account(database);
  const owned = await create_steam().owned(key, steam_id);
  return in_transaction(database, () => import_owned(database, owned));
}

async function import_wishlist(database: SqlDatabase): Promise<GameImportReport> {
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
    sync.wishlist && `wishlist ${sync.wishlist.added} added`,
    ...sync.failures,
  ].filter(Boolean);
  set_games_setting(database, "games.last_steam_sync", sync.ran_at);
  set_games_setting(database, "games.last_steam_result", said.join("; "));
  return sync;
}

// ── itch.io ──────────────────────────────────────────────────────────────────

function itchio_key(database: SqlDatabase): string {
  const key = String(games_setting(database, "games.itchio_api_key")).trim();
  if (!key) throw new Error("Set an itch.io API key in Settings → Games first.");
  return key;
}

// A copy for Windows, macOS or Linux, or one that plays in the browser, is owned on PC; one for Android on Android too.
function itchio_platforms(game: OwnedItchGame): string[] {
  const systems = game.platforms.split(", ").filter(Boolean);
  const android = systems.includes("Android");
  return [...(systems.some((system) => system !== "Android") || !android ? [pc_platform] : []), ...(android ? ["Android"] : [])];
}

// The tracked game with the page, else one of the same title that no itch.io page names yet.
function find_itchio_game(database: SqlDatabase, game: OwnedItchGame): string {
  const by_page = find_game(database, { itchio_id: game.itchio_id });
  if (by_page) return by_page;
  const by_title = find_by_title(database, game.title, "");
  const row = by_title ? drizzle_of(database).select({ itchio_id: games_games.itchio_id }).from(games_games).where(eq(games_games.id, by_title)).get() : undefined;
  return row && !row.itchio_id ? by_title : "";
}

// Every game owned is owned on its platforms from itch.io and leaves the Wishlist; itch.io gives no playtime, so a new one is Backlog.
function import_itchio_owned(database: SqlDatabase, owned: OwnedItchGame[]): GameImportReport {
  const db = drizzle_of(database);
  const report: GameImportReport = { added: 0, updated: 0 };
  for (const game of owned) {
    const platforms = itchio_platforms(game);
    const existing = find_itchio_game(database, game);
    if (existing) {
      const row = db.select().from(games_games).where(eq(games_games.id, existing)).get()!;
      db.update(games_games)
        .set({
          itchio_id: row.itchio_id || game.itchio_id,
          status: owned_status(statuses_of(database), row.status, 0),
          owned_platforms: JSON.stringify(clean_names([...parse_list(row.owned_platforms), ...platforms])),
          owned_stores: with_name(row.owned_stores, itchio_store),
          cover_url: row.cover_url || game.cover_url,
        })
        .where(eq(games_games.id, existing))
        .run();
      report.updated++;
      continue;
    }
    db.insert(games_games)
      .values({
        id: game_key({ itchio_id: game.itchio_id }),
        itchio_id: game.itchio_id,
        title: game.title || game.itchio_id,
        year: game.published.slice(0, 4),
        release_date: game.published,
        cover_url: game.cover_url,
        platforms: game.platforms,
        status: game_status_of(statuses_of(database), "backlog"),
        owned_platforms: JSON.stringify(platforms),
        owned_stores: JSON.stringify([itchio_store]),
        added_at: today(),
      })
      .run();
    report.added++;
  }
  return report;
}

async function import_itchio_library(database: SqlDatabase): Promise<GameImportReport> {
  const owned = await create_itchio().owned(itchio_key(database));
  return in_transaction(database, () => import_itchio_owned(database, owned));
}

async function sync_itchio(database: SqlDatabase): Promise<ItchioSync> {
  const sync: ItchioSync = { ran_at: new Date().toISOString(), library: null, failures: [] };
  try {
    sync.library = await import_itchio_library(database);
  } catch (error) {
    sync.failures.push(`Library: ${(error as Error).message}`);
  }
  const said = [sync.library && `library ${sync.library.added} added, ${sync.library.updated} updated`, ...sync.failures].filter(Boolean);
  set_games_setting(database, "games.last_itchio_sync", sync.ran_at);
  set_games_setting(database, "games.last_itchio_result", said.join("; "));
  return sync;
}

// ── Epic Games Store ─────────────────────────────────────────────────────────

function epic_of(database: SqlDatabase) {
  const id = String(games_setting(database, "games.epic_client_id")).trim();
  const secret = String(games_setting(database, "games.epic_client_secret")).trim();
  if (!id || !secret) throw new Error("Set the Epic Games launcher's client id and secret in Settings → Games first.");
  return create_epic({ id, secret });
}

// The tracked game with the Epic id, else one of the same title that no Epic id names yet.
function find_epic_game(database: SqlDatabase, game: OwnedEpicGame): string {
  const by_id = find_game(database, { epic_id: game.epic_id });
  if (by_id || !game.title) return by_id;
  const by_title = find_by_title(database, game.title, "");
  const row = by_title ? drizzle_of(database).select({ epic_id: games_games.epic_id }).from(games_games).where(eq(games_games.id, by_title)).get() : undefined;
  return row && !row.epic_id ? by_title : "";
}

// Every game owned is owned on PC from the Epic Games Store and leaves the Wishlist; Epic gives no playtime, so a new one is Backlog.
function import_epic_owned(database: SqlDatabase, owned: OwnedEpicGame[]): GameImportReport {
  const db = drizzle_of(database);
  const report: GameImportReport = { added: 0, updated: 0 };
  for (const game of owned) {
    const existing = find_epic_game(database, game);
    if (existing) {
      const row = db.select().from(games_games).where(eq(games_games.id, existing)).get()!;
      db.update(games_games)
        .set({
          epic_id: row.epic_id || game.epic_id,
          status: owned_status(statuses_of(database), row.status, 0),
          owned_platforms: with_name(row.owned_platforms, pc_platform),
          owned_stores: with_name(row.owned_stores, epic_store),
          cover_url: row.cover_url || game.cover_url,
        })
        .where(eq(games_games.id, existing))
        .run();
      report.updated++;
      continue;
    }
    db.insert(games_games)
      .values({
        id: game_key({ epic_id: game.epic_id }),
        epic_id: game.epic_id,
        title: game.title || game.epic_id,
        cover_url: game.cover_url,
        developers: game.developers,
        status: game_status_of(statuses_of(database), "backlog"),
        owned_platforms: JSON.stringify([pc_platform]),
        owned_stores: JSON.stringify([epic_store]),
        added_at: today(),
      })
      .run();
    report.added++;
  }
  return report;
}

// The sign-in is renewed first and kept at once, since the old one is spent; only games not yet tracked by their Epic id are looked up.
async function import_epic_library(database: SqlDatabase): Promise<GameImportReport> {
  const epic = epic_of(database);
  const refresh_token = String(games_setting(database, "games.epic_refresh_token")).trim();
  if (!refresh_token) throw new Error("Sign in to the Epic Games Store in Settings → Games first.");
  const session = await epic.refresh(refresh_token);
  set_games_setting(database, "games.epic_refresh_token", session.refresh_token);
  const items: EpicItem[] = await epic.library(session.access_token);
  const owned: OwnedEpicGame[] = [];
  for (const item of items) {
    if (find_game(database, { epic_id: item.catalog_item_id })) owned.push({ epic_id: item.catalog_item_id, title: "", cover_url: "", developers: "" });
    else {
      const game = await epic.game(session.access_token, item);
      if (game) owned.push(game);
    }
  }
  return in_transaction(database, () => import_epic_owned(database, owned));
}

async function sync_epic(database: SqlDatabase): Promise<EpicSync> {
  const sync: EpicSync = { ran_at: new Date().toISOString(), library: null, failures: [] };
  try {
    sync.library = await import_epic_library(database);
  } catch (error) {
    sync.failures.push(`Library: ${(error as Error).message}`);
  }
  const said = [sync.library && `library ${sync.library.added} added, ${sync.library.updated} updated`, ...sync.failures].filter(Boolean);
  set_games_setting(database, "games.last_epic_sync", sync.ran_at);
  set_games_setting(database, "games.last_epic_result", said.join("; "));
  return sync;
}

// ── Steam categories ─────────────────────────────────────────────────────────

// The mapping as set, by each category's name in lower case; a status no longer known is left out.
function category_statuses(database: SqlDatabase): Map<string, GameStatus> {
  const mapping = games_setting(database, "games.steam_category_statuses") ?? {};
  const statuses = statuses_of(database);
  return new Map(Object.entries(mapping).flatMap(([name, status]) => (is_game_status(statuses, status) ? [[name.toLowerCase(), status] as const] : [])));
}

// A tracked game in a mapped category takes that category's status; in several, the furthest along wins.
function import_categories(database: SqlDatabase, categories: SteamCategory[]): SteamCategoryReport {
  const db = drizzle_of(database);
  set_games_setting(database, "games.steam_categories", categories.map((category) => category.name));
  const statuses = statuses_of(database);
  const mapped = category_statuses(database);
  const wanted = new Map<string, GameStatus>();
  for (const category of categories) {
    const status = mapped.get(category.name.toLowerCase());
    if (!status) continue;
    for (const app_id of category.app_ids) wanted.set(app_id, furthest_status(statuses, wanted.get(app_id) ?? status, status));
  }
  const report: SteamCategoryReport = { categories: categories.length, updated: 0, untracked: 0 };
  for (const [app_id, status] of wanted) {
    const id = find_game(database, { steam_app_id: app_id });
    if (!id) {
      report.untracked++;
      continue;
    }
    const row = db.select({ status: games_games.status }).from(games_games).where(eq(games_games.id, id)).get()!;
    if (row.status === status) continue;
    db.update(games_games).set({ status }).where(eq(games_games.id, id)).run();
    report.updated++;
  }
  return report;
}

// ── IGDB ─────────────────────────────────────────────────────────────────────

// A game still to play takes the imported status; one already played keeps its own.
function moved_on(statuses: GameStatusInfo[], stored: string, imported: GameStatus): GameStatus {
  const status = game_status_of(statuses, stored);
  return is_unplayed(statuses, status) ? game_status_of(statuses, imported) : status;
}

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
        status: moved_on(statuses_of(database), row.status, game.status),
        rating: row.rating ?? game.rating,
        review: row.review || game.review,
        owned_platforms: JSON.stringify(clean_names([...parse_list(row.owned_platforms), ...game.platforms])),
      })
      .where(eq(games_games.id, existing))
      .run();
  } else {
    id = `title:${title_words(game.title)}`;
    db.insert(games_games)
      .values({ id, title: game.title, status: game_status_of(statuses_of(database), game.status), rating: game.rating, review: game.review, owned_platforms: JSON.stringify(game.platforms), added_at: today() })
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
  thegamesdb_id: "TheGamesDB id",
  gog_id: "GOG id",
  steamgriddb_id: "SteamGridDB id",
  itchio_id: "itch.io page",
  epic_id: "Epic Games Store catalogue item id",
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
  clean("igdb_id", (input) => link_id("igdb")(input) || (/^[a-z0-9-]+$/i.test(input) ? input.toLowerCase() : ""), "portal-2");
  clean("thegamesdb_id", (input) => link_id("thegamesdb")(input) || (/^\d+$/.test(input) ? input : ""), "1234");
  clean("gog_id", parse_gog_slug, "the_witcher_3_wild_hunt");
  clean("steamgriddb_id", (input) => /steamgriddb\.com\/game\/(\d+)/i.exec(input)?.[1] ?? (/^\d+$/.test(input) ? input : ""), "21207");
  clean("itchio_id", parse_itchio_id, "innersloth/among-us");
  clean("epic_id", parse_epic_id, "c4763f236d08423eb47b4c3008779c84");
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

// Where the catalogues start on a tracked game; one known only by its title is first looked for on Wikidata, and null
// when it is not there.
async function start_of(database: SqlDatabase, game: LibraryGame): Promise<CatalogGame | null> {
  const start: CatalogGame = { ...empty_game("wikidata"), ...Object.fromEntries(game_id_keys.map((key) => [key, game[key]])) };
  if (game_key(start)) return start;
  const wikidata = (await catalogs_of(database)).find((catalog) => catalog.source === "wikidata" && catalog.search);
  if (!wikidata) return null;
  const candidate: CatalogGame = { ...empty_game("wikidata"), title: game.title, year: game.year };
  const match = (await wikidata.search!(game.title)).find((found) => same_game(found, candidate));
  return match ? ids_only(match) : null;
}

async function refresh_game(database: SqlDatabase, game: LibraryGame): Promise<boolean> {
  const start = await start_of(database, game);
  if (!start) return false;
  const details = game.cover_by_hand ? await gather(database, start) : await gather_with_cover(database, start, game.cover_file_from);
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

// ── Merging ──────────────────────────────────────────────────────────────────

const game_merge_columns = {
  ...Object.fromEntries(game_id_keys.map((key) => [key, "text"])),
  ...Object.fromEntries(
    ["title", "year", "release_date", "overview", "cover_url", "cover_file", "cover_file_from", "genres", "platforms", "developers", "publishers", "status", "review", "notes", "owned_platforms", "owned_stores", "edition", "last_played", "added_at", "base_game", "base_game_title"].map((key) => [
      key,
      "text",
    ]),
  ),
  playtime_minutes: "number",
  rating: "nullable_number",
  cover_by_hand: "boolean",
} as const;

// Each catalogue's own answer about a tracked game, for picking what to keep field by field.
async function game_sources(database: SqlDatabase, game: LibraryGame): Promise<SourceAnswers> {
  const start = await start_of(database, game).catch(() => null);
  if (!start) return { answers: [], failures: ["Wikidata: no game with that title and year."] };
  const heard: Heard = { answers: {}, failures: [] };
  await gather(database, start, heard).catch(() => undefined);
  const answers = detail_order.flatMap((source) => {
    const found = heard.answers[source];
    return found ? [{ source, label: catalog_labels[source], values: { ...metadata_of(found), ...base_of(undefined, found) } }] : [];
  });
  return { answers, failures: heard.failures };
}

// The games merged become the one kept: it takes the values given and every collection of the others, DLC of the
// others points at it, and the others are removed.
function merge_into(database: SqlDatabase, ids: string[], keep: string, values: Record<string, unknown>): LibraryGame {
  const merged = merge_ids(ids, keep);
  for (const id of merged) require_game(database, id);
  const stored = { ...values };
  for (const key of ["owned_platforms", "owned_stores"]) {
    if (key in stored && typeof stored[key] !== "string") stored[key] = JSON.stringify(clean_names(stored[key] as string[]));
  }
  const fields = merge_columns(stored, game_merge_columns);
  if (fields.status !== undefined && !is_game_status(statuses_of(database), fields.status)) throw new Error(`Unknown status: ${String(fields.status)}.`);
  const db = drizzle_of(database);
  for (const key of game_id_keys) {
    const value = fields[key];
    if (typeof value !== "string" || !value) continue;
    const other = db.select({ id: games_games.id, title: games_games.title }).from(games_games).where(eq(games_games[key], value)).all().find((row) => !merged.includes(row.id));
    if (other) throw new Error(`${other.title} already has that ${id_labels[key]}; merge it too, or remove one of the two games first.`);
  }
  const others = merged.filter((id) => id !== keep);
  in_transaction(database, () => {
    if (others.length > 0) {
      for (const link of db.select().from(games_game_collections).where(inArray(games_game_collections.game_id, others)).all()) {
        db.insert(games_game_collections).values({ game_id: keep, collection_id: link.collection_id }).onConflictDoNothing().run();
      }
      db.update(games_games).set({ base_game: keep }).where(inArray(games_games.base_game, others)).run();
      db.delete(games_games).where(inArray(games_games.id, others)).run();
    }
    if (Object.keys(fields).length > 0) db.update(games_games).set(fields).where(eq(games_games.id, keep)).run();
    // A game is never DLC of itself, as when one merged was DLC of another.
    const base = db.select({ base_game: games_games.base_game }).from(games_games).where(eq(games_games.id, keep)).get()?.base_game ?? "";
    if (merged.includes(base)) db.update(games_games).set({ base_game: "", base_game_title: "" }).where(eq(games_games.id, keep)).run();
  });
  return require_game(database, keep);
}

// ── Statuses ─────────────────────────────────────────────────────────────────

// A new status goes last in its group; a renamed one keeps its place, and one moved to another group goes last there.
function save_status(database: SqlDatabase, status: { id?: string; label: string; group?: GameStatusGroup }): GameStatusInfo {
  const statuses = statuses_of(database);
  const label = String(status.label ?? "").trim();
  if (!label) throw new Error("A status needs a name.");
  const existing = status.id ? statuses.find((each) => each.id === status.id) : undefined;
  if (status.id && !existing) throw new Error(`Unknown status: ${status.id}.`);
  const group = status.group ?? existing?.group;
  if (!group || !(game_status_groups as readonly string[]).includes(group)) throw new Error(`A status is in one of the groups ${game_status_groups.join(", ")}.`);
  if (statuses.some((each) => each.id !== existing?.id && each.group === group && each.label.toLowerCase() === label.toLowerCase())) throw new Error(`${game_status_group_labels[group]} already has a status named ${label}.`);
  if (existing && existing.group !== group && statuses.filter((each) => each.group === existing.group).length === 1) throw new Error(`${game_status_group_labels[existing.group]} needs at least one status.`);
  const saved: GameStatusInfo = { id: existing?.id ?? new_id(), label, group };
  const kept = existing && existing.group === group ? statuses.map((each) => (each.id === saved.id ? saved : each)) : [...statuses.filter((each) => each.id !== saved.id), saved];
  set_games_setting(database, "games.statuses", clean_game_statuses(kept));
  return saved;
}

// Games, new games' status and Steam categories on a removed status move to its group's status left: Backlog, Currently playing or Finished, else the first.
function remove_status(database: SqlDatabase, id: string): void {
  const statuses = statuses_of(database);
  const removed = statuses.find((each) => each.id === id);
  if (!removed) throw new Error(`Unknown status: ${id}.`);
  const left = statuses.filter((each) => each.id !== id);
  if (!left.some((each) => each.group === removed.group)) throw new Error(`${game_status_group_labels[removed.group]} needs at least one status.`);
  const replacement = group_status(left, removed.group);
  in_transaction(database, () => {
    drizzle_of(database).update(games_games).set({ status: replacement }).where(eq(games_games.status, id)).run();
    set_games_setting(database, "games.statuses", left);
    if (games_setting(database, "games.default_status") === id) set_games_setting(database, "games.default_status", replacement);
    const mapping = games_setting(database, "games.steam_category_statuses") ?? {};
    set_games_setting(database, "games.steam_category_statuses", Object.fromEntries(Object.entries(mapping).map(([name, status]) => [name, status === id ? replacement : status])));
  });
}

// Swaps a status with the one before or after it in its group.
function move_status(database: SqlDatabase, id: string, step: -1 | 1): void {
  const statuses = statuses_of(database);
  const from = statuses.findIndex((each) => each.id === id);
  if (from < 0) throw new Error(`Unknown status: ${id}.`);
  if (step !== -1 && step !== 1) throw new Error("A status moves by -1 or 1.");
  const to = from + step;
  if (to < 0 || to >= statuses.length || statuses[to]!.group !== statuses[from]!.group) return;
  [statuses[from], statuses[to]] = [statuses[to]!, statuses[from]!];
  set_games_setting(database, "games.statuses", statuses);
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
  on_open: (database: SqlDatabase) => move_settings_into_plugins(database, moved_game_keys),
  methods: {
    list_games: (database: SqlDatabase): Games => ({
      games: list_games(database),
      collections: drizzle_of(database).select().from(games_collections).orderBy(asc(games_collections.name)).all(),
      statuses: statuses_of(database),
    }),

    get_game: (database: SqlDatabase, id: string): LibraryGame | null => list_games(database, [id])[0] ?? null,

    search_games: (database: SqlDatabase, query: string): Promise<GameSearch> => search_everywhere(database, query),

    add_game: (database: SqlDatabase, source: GameSource, id: string): Promise<AddedGame> => add_from(database, source, id),

    add_game_from_link: (database: SqlDatabase, link: string): Promise<AddedGame> => {
      const parsed = parse_game_link(link);
      if (!parsed) throw new Error("Not a RAWG, IGDB, MobyGames, Giant Bomb, TheGamesDB, GOG, Wikidata, Steam store or itch.io link, such as https://rawg.io/games/portal-2 or https://store.steampowered.com/app/620/.");
      return add_from(database, parsed.source, parsed.id);
    },

    set_game_ids: (database: SqlDatabase, id: string, ids: Partial<GameIds>): Promise<LibraryGame> => set_ids(database, id, ids),

    lookup_game_sources: (database: SqlDatabase, id: string): Promise<SourceAnswers> => game_sources(database, require_game(database, id)),

    merge_games: (database: SqlDatabase, ids: string[], keep: string, values: Record<string, unknown>): LibraryGame => merge_into(database, ids, keep, values),

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
      if (!is_game_status(statuses_of(database), status)) throw new Error(`Unknown status: ${String(status)}.`);
      update_game(database, id, { status });
    },

    save_game_status: (database: SqlDatabase, status: { id?: string; label: string; group?: GameStatusGroup }): GameStatusInfo => save_status(database, status),

    remove_game_status: (database: SqlDatabase, id: string): void => remove_status(database, id),

    move_game_status: (database: SqlDatabase, id: string, step: -1 | 1): void => move_status(database, id, step),

    set_game_rating: (database: SqlDatabase, id: string, rating: number | null): void => {
      if (rating !== null && !(Number.isFinite(rating) && rating >= 0 && rating <= 10)) throw new Error("A rating is 1 to 10, or none.");
      update_game(database, id, { rating: rating ? Math.round(rating) : null });
    },

    set_game_review: (database: SqlDatabase, id: string, review: string): void => update_game(database, id, { review: review.trim() }),

    set_game_notes: (database: SqlDatabase, id: string, notes: string): void => update_game(database, id, { notes: notes.trim() }),

    // A new address is downloaded into the synced cover file soon after; empty goes back to no cover.
    set_game_cover: (database: SqlDatabase, id: string, address: string): void => {
      const cover_url = address.trim();
      if (cover_url !== "" && !/^https?:\/\/\S+$/i.test(cover_url)) throw new Error("A cover is the web address of an image, starting with http:// or https://.");
      update_game(database, id, cover_url === "" ? { cover_url, cover_file: "", cover_file_from: "", cover_by_hand: false } : { cover_url, cover_by_hand: true });
    },

    set_game_platforms: (database: SqlDatabase, id: string, platforms: string[]): void => {
      if (!Array.isArray(platforms)) throw new Error("Platforms are a list of names, such as PC or Nintendo Switch.");
      update_game(database, id, { owned_platforms: JSON.stringify(clean_names(platforms.map(String))) });
    },

    set_game_stores: (database: SqlDatabase, id: string, stores: string[]): void => {
      if (!Array.isArray(stores)) throw new Error("Stores are a list of names, such as Steam or GOG.");
      update_game(database, id, { owned_stores: JSON.stringify(clean_names(stores.map(String))) });
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

    import_steam_wishlist: (database: SqlDatabase): Promise<GameImportReport> => import_wishlist(database),

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

    import_itchio_library: (database: SqlDatabase): Promise<GameImportReport> => import_itchio_library(database),

    // Imports the itch.io library when the hours set have passed, or now when forced; gives what it did, or null when it
    // was not due or no key is set.
    run_itchio_sync: async (database: SqlDatabase, force: boolean): Promise<ItchioSync | null> => {
      const hours = Number(games_setting(database, "games.itchio_sync_hours"));
      if (!force && !(hours > 0)) return null;
      const last = Date.parse(String(games_setting(database, "games.last_itchio_sync")));
      if (!force && Number.isFinite(last) && Date.now() - last < hours * hour_in_milliseconds) return null;
      if (!force && !String(games_setting(database, "games.itchio_api_key")).trim()) return null;
      return sync_itchio(database);
    },

    // Trades the one-time code from Epic's sign-in page for a sign-in kept in settings; gives the account's name.
    sign_in_epic: async (database: SqlDatabase, code: string): Promise<string> => {
      const parsed = parse_epic_code(code);
      if (!parsed) throw new Error("Paste the authorizationCode from Epic's page, or the whole answer it shows.");
      const session = await epic_of(database).sign_in(parsed);
      set_games_setting(database, "games.epic_refresh_token", session.refresh_token);
      set_games_setting(database, "games.epic_account", session.display_name);
      return session.display_name;
    },

    sign_out_epic: (database: SqlDatabase): void => {
      set_games_setting(database, "games.epic_refresh_token", "");
      set_games_setting(database, "games.epic_account", "");
    },

    import_epic_library: (database: SqlDatabase): Promise<GameImportReport> => import_epic_library(database),

    // Imports the Epic library when the hours set have passed, or now when forced; gives what it did, or null when it
    // was not due or no one is signed in.
    run_epic_sync: async (database: SqlDatabase, force: boolean): Promise<EpicSync | null> => {
      const hours = Number(games_setting(database, "games.epic_sync_hours"));
      if (!force && !(hours > 0)) return null;
      const last = Date.parse(String(games_setting(database, "games.last_epic_sync")));
      if (!force && Number.isFinite(last) && Date.now() - last < hours * hour_in_milliseconds) return null;
      if (!force && !String(games_setting(database, "games.epic_refresh_token")).trim()) return null;
      return sync_epic(database);
    },

    // The Steam client's categories file; games in a category mapped in Settings take its status.
    import_steam_categories: (database: SqlDatabase, categories_json: string): SteamCategoryReport => {
      const categories = read_steam_categories(categories_json);
      if (categories.length === 0) throw new Error("No categories found; pick cloud-storage-namespace-1.json from Steam's userdata/<account>/config/cloudstorage folder.");
      return in_transaction(database, () => import_categories(database, categories));
    },

    // Maps a Steam category, by its name, to a status, or unmaps it with an empty status.
    set_steam_category_status: (database: SqlDatabase, category: string, status: GameStatus | ""): void => {
      const name = category.trim();
      if (!name) throw new Error("A category needs a name.");
      if (status && !is_game_status(statuses_of(database), status)) throw new Error(`Unknown status: ${String(status)}.`);
      const mapping = Object.fromEntries(Object.entries(games_setting(database, "games.steam_category_statuses") ?? {}).filter(([each]) => each.toLowerCase() !== name.toLowerCase()));
      set_games_setting(database, "games.steam_category_statuses", status ? { ...mapping, [name]: status } : mapping);
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

    export_games_json: (database: SqlDatabase): TransferFile => export_games_json(database),
    export_games_csv: (database: SqlDatabase): Record<string, string> => export_games_csv(database),
    import_games_file: (database: SqlDatabase, input: TransferInput): TransferReport => import_games_file(database, input),
  },
  api: games_api,
});
