// Trakt as a source: signing in with the user's own Trakt app, importing what was watched, archiving everything Trakt
// holds before leaving it, and comparing its history with the library one watch at a time. Only remove_trakt_watch
// writes to Trakt, one watch at a time, and only once the library holds that watch.

// ── Imports ──────────────────────────────────────────────────────────────────

import { desc, eq, synced_tables } from "@x-tech-laboratories/x-libs/drizzle";
import type { SqlDatabase } from "@x-tech-laboratories/x-libs/sql";

import { define_feature, drizzle_of, new_id } from "../../feature.ts";
import { apply_import } from "../../library/importing.ts";
import { has_episode, parse_episodes } from "../../library/model.ts";
import { find_title, list_titles, type ImportReport } from "../../library/store.ts";
import { settings_feature } from "../../settings.ts";
import { require_switched_on } from "../host.ts";
import { trakt_manifest } from "../manifests.ts";
import { trakt_api } from "./api.ts";
import { create_trakt, type DeviceCode, type TraktClient, type TraktCredentials, type TraktTokens } from "./client.ts";
import { history_rows, item_from_row, items_from_ratings, items_from_watched, type HistoryRow } from "./mapping.ts";
import { migrations } from "./migrations/index.ts";
import { trakt_archives, trakt_tables } from "./schema.ts";
import { trakt_secret_settings, trakt_setting_defaults } from "./settings.ts";

// ── Shapes ───────────────────────────────────────────────────────────────────

export interface TraktStatus {
  client_id: string;
  has_client_secret: boolean;
  signed_in: boolean;
  // Unix seconds, or 0.
  expires_at: number;
}

export interface ArchiveReport extends ImportReport {
  archive_id: string;
  counts: Record<string, number | null>;
  // One line per list that could not be read; while any remain, nothing should be deleted from Trakt.
  failures: string[];
  ratings_applied: number;
}

export interface ArchiveSummary {
  id: string;
  fetched_at: string;
  counts: Record<string, number | null>;
  failures: string[];
}

export interface ComparedRow extends HistoryRow {
  // Whether the library holds that watch: the movie watched, or that episode ticked.
  captured: boolean;
}

export interface Comparison {
  rows: ComparedRow[];
  total: number;
  captured: number;
  missing: number;
}

// Every list Trakt syncs, read whole for the archive.
const archive_lists = {
  watched_movies: "/sync/watched/movies",
  watched_shows: "/sync/watched/shows",
  history_movies: "/sync/history/movies",
  history_episodes: "/sync/history/episodes",
  ratings_movies: "/sync/ratings/movies",
  ratings_shows: "/sync/ratings/shows",
  ratings_seasons: "/sync/ratings/seasons",
  ratings_episodes: "/sync/ratings/episodes",
  watchlist_movies: "/sync/watchlist/movies",
  watchlist_shows: "/sync/watchlist/shows",
  collection_movies: "/sync/collection/movies",
  collection_shows: "/sync/collection/shows",
};

// ── Credentials ──────────────────────────────────────────────────────────────

type Json = Record<string, unknown>;

function credentials_of(database: SqlDatabase): TraktCredentials {
  const values = { ...trakt_setting_defaults, ...settings_feature.methods.get_settings(database) };
  return {
    client_id: String(values["trakt.client_id"]),
    client_secret: String(values["trakt.client_secret"]),
    access_token: String(values["trakt.access_token"]),
    refresh_token: String(values["trakt.refresh_token"]),
    expires_at: Number(values["trakt.expires_at"]) || 0,
  };
}

function save_tokens(database: SqlDatabase, tokens: TraktTokens): void {
  settings_feature.methods.set_setting(database, "trakt.access_token", tokens.access_token);
  settings_feature.methods.set_setting(database, "trakt.refresh_token", tokens.refresh_token);
  settings_feature.methods.set_setting(database, "trakt.expires_at", tokens.expires_at);
}

export function is_trakt_ready(database: SqlDatabase): boolean {
  const credentials = credentials_of(database);
  return credentials.client_id.trim() !== "" && credentials.access_token !== "";
}

// A client signed in as the user, its tokens renewed first when they are about to run out.
async function signed_in_client(database: SqlDatabase): Promise<TraktClient> {
  require_switched_on(database, trakt_manifest);
  const credentials = credentials_of(database);
  if (!credentials.access_token) throw new Error("Sign in to Trakt first.");
  const renewed = await create_trakt(credentials).renew_if_needed(Math.floor(Date.now() / 1000));
  if (!renewed) return create_trakt(credentials);
  save_tokens(database, renewed);
  return create_trakt({ ...credentials, ...renewed });
}

// ── Captured ─────────────────────────────────────────────────────────────────

// Whether the library holds a watch from Trakt's history, so it is safe to remove from Trakt.
function is_captured(database: SqlDatabase, row: HistoryRow): boolean {
  const id = find_title(database, row);
  if (!id) return false;
  const [title] = list_titles(database, [id]);
  if (!title) return false;
  if (row.media_type === "movie") return title.status === "watched";
  return has_episode(parse_episodes(title.watched_episodes), row.season, row.episode);
}

// ── Importing ────────────────────────────────────────────────────────────────

// Ratings land only on titles already in the library, as Trakt rates far more than was watched.
async function apply_ratings(database: SqlDatabase, rated: Json[]): Promise<number> {
  const known = items_from_ratings(rated).filter((item) => find_title(database, item) !== "");
  await apply_import(database, known);
  return known.length;
}

export async function import_trakt(database: SqlDatabase): Promise<ImportReport> {
  const trakt = await signed_in_client(database);
  const movies = await trakt.read_all("/sync/watched/movies");
  const shows = await trakt.read_all("/sync/watched/shows");
  return apply_import(database, items_from_watched(movies, shows));
}

// ── Feature ──────────────────────────────────────────────────────────────────

export const trakt_feature = define_feature({
  id: "trakt",
  migrations: migrations.map((migration) => migration.statements),
  tables: synced_tables(trakt_tables),
  setting_defaults: trakt_setting_defaults,
  secret_settings: trakt_secret_settings,
  methods: {
    get_trakt_status: (database: SqlDatabase): TraktStatus => {
      const credentials = credentials_of(database);
      return { client_id: credentials.client_id, has_client_secret: credentials.client_secret !== "", signed_in: credentials.access_token !== "", expires_at: credentials.expires_at };
    },

    // A blank secret keeps the one already set, so the page never needs to read it back.
    set_trakt_app: (database: SqlDatabase, client_id: string, client_secret: string): void => {
      settings_feature.methods.set_setting(database, "trakt.client_id", client_id.trim());
      if (client_secret.trim()) settings_feature.methods.set_setting(database, "trakt.client_secret", client_secret.trim());
    },

    start_trakt_sign_in: async (database: SqlDatabase): Promise<DeviceCode> => {
      require_switched_on(database, trakt_manifest);
      return create_trakt(credentials_of(database)).start_device_sign_in();
    },

    // Asked every few seconds while the user enters the code on Trakt's site; "authorized" once they have.
    poll_trakt_sign_in: async (database: SqlDatabase, device_code: string): Promise<{ state: "authorized" | "pending" | "slow_down" }> => {
      require_switched_on(database, trakt_manifest);
      const answer = await create_trakt(credentials_of(database)).poll_device_sign_in(device_code);
      if (answer.state === "authorized") save_tokens(database, answer.tokens);
      return { state: answer.state };
    },

    sign_out_trakt: (database: SqlDatabase): void => save_tokens(database, { access_token: "", refresh_token: "", expires_at: 0 }),

    import_trakt,

    // Reads every list Trakt holds and keeps Trakt's answers whole, then imports what was watched and the ratings.
    archive_trakt: async (database: SqlDatabase): Promise<ArchiveReport> => {
      const trakt = await signed_in_client(database);
      const data: Record<string, Json[]> = {};
      const counts: Record<string, number | null> = {};
      const failures: string[] = [];
      for (const [name, path] of Object.entries(archive_lists)) {
        try {
          data[name] = await trakt.read_all(path);
          counts[name] = data[name]!.length;
        } catch (error) {
          failures.push(`${name}: ${(error as Error).message}`);
          counts[name] = null;
        }
      }
      const archive_id = new_id();
      drizzle_of(database)
        .insert(trakt_archives)
        .values({ id: archive_id, fetched_at: new Date().toISOString(), counts: JSON.stringify(counts), failures: JSON.stringify(failures), data: JSON.stringify(data) })
        .run();
      const imported = await apply_import(database, items_from_watched(data.watched_movies ?? [], data.watched_shows ?? []));
      const ratings_applied = await apply_ratings(database, [...(data.ratings_movies ?? []), ...(data.ratings_shows ?? [])]);
      return { ...imported, archive_id, counts, failures, ratings_applied };
    },

    list_trakt_archives: (database: SqlDatabase): ArchiveSummary[] =>
      drizzle_of(database)
        .select({ id: trakt_archives.id, fetched_at: trakt_archives.fetched_at, counts: trakt_archives.counts, failures: trakt_archives.failures })
        .from(trakt_archives)
        .orderBy(desc(trakt_archives.fetched_at))
        .all()
        .map((row) => ({ ...row, counts: JSON.parse(row.counts), failures: JSON.parse(row.failures) })),

    export_trakt_archive: (database: SqlDatabase, id: string): string => {
      const row = drizzle_of(database).select().from(trakt_archives).where(eq(trakt_archives.id, id)).get();
      if (!row) throw new Error("There is no Trakt archive with that id.");
      return JSON.stringify({ fetched_at: row.fetched_at, counts: JSON.parse(row.counts), failures: JSON.parse(row.failures), data: JSON.parse(row.data) }, null, 2);
    },

    // Trakt's whole history beside the library, newest first; it writes only renewed sign-in tokens.
    lookup_trakt_history: async (database: SqlDatabase): Promise<Comparison> => {
      const trakt = await signed_in_client(database);
      const rows = history_rows(await trakt.read_all("/sync/history/movies"), await trakt.read_all("/sync/history/episodes")).map((row) => ({ ...row, captured: is_captured(database, row) }));
      const captured = rows.filter((row) => row.captured).length;
      return { rows, total: rows.length, captured, missing: rows.length - captured };
    },

    // Brings one watch from the comparison into the library, merged with what is there.
    import_trakt_watch: async (database: SqlDatabase, row: HistoryRow): Promise<ImportReport> => {
      require_switched_on(database, trakt_manifest);
      if (row.media_type === "episode" && !(row.season > 0 && row.episode > 0)) throw new Error("That watch has no season and episode number.");
      return apply_import(database, [item_from_row(row)], { marks_watched: true });
    },

    // Removes one watch from Trakt's history for good; refused unless the library holds it.
    remove_trakt_watch: async (database: SqlDatabase, row: HistoryRow): Promise<void> => {
      if (!(row.history_id > 0)) throw new Error("A watch needs Trakt's history id.");
      if (!is_captured(database, row)) throw new Error("The library does not hold that watch yet. Import it first; removing it from Trakt now would lose it.");
      await (await signed_in_client(database)).remove_history_entry(row.history_id);
    },
  },
  api: trakt_api,
});
