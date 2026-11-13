// The library: every movie and show tracked, with its status, rating, watched episodes and collections, and the
// collection groups that sort collections into axes such as Mood or Franchise. TMDB fills in what titles are.

// ── Imports ──────────────────────────────────────────────────────────────────

import { today } from "@x-tech-laboratories/x-libs/dates";
import { and, asc, count, eq, inArray, or, synced_tables } from "@x-tech-laboratories/x-libs/drizzle";
import { in_transaction, type SqlDatabase } from "@x-tech-laboratories/x-libs/sql";

import { define_feature, drizzle_of, new_id } from "../feature.ts";
import { library_api } from "./api.ts";
import { migrations } from "./migrations/index.ts";
import {
  episodes_in,
  format_episodes,
  is_status,
  normalize_names,
  parse_episodes,
  parse_media_link,
  status_from_progress,
  title_key,
  type Collection,
  type CollectionGroup,
  type EpisodeRange,
  type LibraryTitle,
  type MediaType,
  type Seasons,
  type Status,
  type Title,
  type TitleIds,
} from "./model.ts";
import { library_collection_groups, library_collections, library_episodes, library_tables, library_title_collections, library_titles } from "./schema.ts";
import { library_secret_settings, library_setting_defaults } from "./settings.ts";
import { create_tmdb, resolve_details, type Tmdb, type TmdbDetails, type TmdbFullDetails, type TmdbTitle } from "./tmdb.ts";
import { read_trilium_database, read_trilium_groups, write_trilium_database, type ImportedTitle } from "./trilium.ts";

// ── Shapes ───────────────────────────────────────────────────────────────────

export interface Library {
  titles: LibraryTitle[];
  collections: Collection[];
  groups: CollectionGroup[];
}

export interface SearchResult extends TmdbTitle {
  // The library's title with any of the same ids, or "" when it is not tracked.
  tracked_id: string;
}

export interface Added {
  id: string;
  name: string;
  existed: boolean;
}

export interface TitleDetails extends TmdbFullDetails {
  title: LibraryTitle;
}

export interface RefreshReport {
  total: number;
  metadata_updated: number;
  status_updated: number;
  failed: number;
}

export interface ImportReport {
  added: number;
  updated: number;
}

// ── Settings ─────────────────────────────────────────────────────────────────

type LibrarySetting = keyof typeof library_setting_defaults;

export function setting<Key extends LibrarySetting>(database: SqlDatabase, key: Key): (typeof library_setting_defaults)[Key] {
  const row = database.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row ? JSON.parse(row.value) : library_setting_defaults[key];
}

export function tmdb_of(database: SqlDatabase): Tmdb {
  return create_tmdb(setting(database, "library.tmdb_api_key"));
}

// ── Reading ──────────────────────────────────────────────────────────────────

function read_seasons(database: SqlDatabase, title_id: string): Seasons {
  const seasons: Seasons = new Map();
  const rows = drizzle_of(database).select({ season: library_episodes.season, episode: library_episodes.episode }).from(library_episodes).where(eq(library_episodes.title_id, title_id)).all();
  for (const row of rows) seasons.set(row.season, (seasons.get(row.season) ?? new Set()).add(row.episode));
  return seasons;
}

function as_title(row: typeof library_titles.$inferSelect): Title {
  return { ...row, media_type: row.media_type === "show" ? "show" : "movie", status: is_status(row.status) ? row.status : "planned" };
}

export function list_titles(database: SqlDatabase, ids?: string[]): LibraryTitle[] {
  const db = drizzle_of(database);
  const rows = ids ? db.select().from(library_titles).where(inArray(library_titles.id, ids)).all() : db.select().from(library_titles).orderBy(asc(library_titles.name)).all();
  const links = db.select().from(library_title_collections).all();
  const collections_of = new Map<string, string[]>();
  for (const link of links) collections_of.set(link.title_id, [...(collections_of.get(link.title_id) ?? []), link.collection_id]);
  return rows.map((row) => {
    const seasons = row.media_type === "show" ? read_seasons(database, row.id) : new Map();
    let watched_count = 0;
    for (const episodes of seasons.values()) watched_count += episodes.size;
    return { ...as_title(row), collection_ids: collections_of.get(row.id) ?? [], watched_count, watched_episodes: format_episodes(seasons) };
  });
}

export function require_title(database: SqlDatabase, id: string): LibraryTitle {
  const [title] = list_titles(database, [id]);
  if (!title) throw new Error("That title is not in the library.");
  return title;
}

// The library's title with any of the ids given, so sources that know a title by different ids land on one row.
export function find_title(database: SqlDatabase, ids: Partial<TitleIds>): string {
  const key = title_key(ids);
  const db = drizzle_of(database);
  if (key && db.select({ id: library_titles.id }).from(library_titles).where(eq(library_titles.id, key)).get()) return key;
  const matches = [
    ids.tmdb_id ? eq(library_titles.tmdb_id, String(ids.tmdb_id)) : undefined,
    ids.imdb_id ? eq(library_titles.imdb_id, String(ids.imdb_id)) : undefined,
    ids.trakt_id ? eq(library_titles.trakt_id, String(ids.trakt_id)) : undefined,
  ].filter((match) => match !== undefined);
  if (matches.length === 0) return "";
  return db.select({ id: library_titles.id }).from(library_titles).where(or(...matches)).get()?.id ?? "";
}

// ── Writing ──────────────────────────────────────────────────────────────────

// An episode already watched keeps the day it was first marked.
export function write_episodes(database: SqlDatabase, title_id: string, episodes: { season: number; episode: number; watched_at?: string }[], watched: boolean): void {
  const db = drizzle_of(database);
  const marked_on = today();
  for (const { season, episode, watched_at } of episodes) {
    const where = and(eq(library_episodes.title_id, title_id), eq(library_episodes.season, season), eq(library_episodes.episode, episode));
    if (watched) db.insert(library_episodes).values({ title_id, season, episode, watched_at: watched_at || marked_on }).onConflictDoNothing().run();
    else db.delete(library_episodes).where(where).run();
  }
}

// A show's status follows how many of its episodes are watched.
export function settle_status(database: SqlDatabase, title_id: string): Status {
  const db = drizzle_of(database);
  const row = db.select({ total: library_titles.total_episodes }).from(library_titles).where(eq(library_titles.id, title_id)).get();
  const watched = db.select({ watched: count() }).from(library_episodes).where(eq(library_episodes.title_id, title_id)).get()!.watched;
  const status = status_from_progress(watched, row?.total ?? 0);
  db.update(library_titles).set({ status }).where(eq(library_titles.id, title_id)).run();
  return status;
}

function metadata_of(details: TmdbDetails) {
  return {
    tmdb_id: details.tmdb_id,
    name: details.name,
    year: details.year,
    overview: details.overview,
    poster_path: details.poster_path,
    genres: details.genres,
    runtime: details.runtime,
  };
}

// A title already tracked keeps its status, rating and progress; only what TMDB says of it is refreshed.
function add_details(database: SqlDatabase, details: TmdbDetails): Added {
  const db = drizzle_of(database);
  const existing = find_title(database, details);
  if (existing) {
    const row = db.select().from(library_titles).where(eq(library_titles.id, existing)).get()!;
    db.update(library_titles)
      .set({ ...metadata_of(details), imdb_id: details.imdb_id || row.imdb_id, total_episodes: details.total_episodes || row.total_episodes })
      .where(eq(library_titles.id, existing))
      .run();
    return { id: existing, name: details.name, existed: true };
  }
  const id = title_key(details);
  const status = setting(database, "library.default_status");
  db.insert(library_titles)
    .values({ id, ...metadata_of(details), imdb_id: details.imdb_id, media_type: details.media_type, status: is_status(status) ? status : "planned", total_episodes: details.total_episodes, added_at: today() })
    .run();
  return { id, name: details.name, existed: false };
}

// The collection with this name whatever its case, made in the group given when there is none.
function collection_named(database: SqlDatabase, name: string, group_id: string | null): string {
  const db = drizzle_of(database);
  const found = db
    .select()
    .from(library_collections)
    .all()
    .find((collection) => collection.name.toLowerCase() === name.toLowerCase());
  if (found) return found.id;
  const id = new_id();
  db.insert(library_collections).values({ id, name, group_id }).run();
  return id;
}

function group_named(database: SqlDatabase, name: string): string {
  const db = drizzle_of(database);
  const groups = db.select().from(library_collection_groups).all();
  const found = groups.find((group) => group.name.toLowerCase() === name.toLowerCase());
  if (found) return found.id;
  const id = new_id();
  db.insert(library_collection_groups).values({ id, name, position: groups.length }).run();
  return id;
}

// One Trilium title into the library: a new one whole; one already here gains its episodes and collections, and what it
// lacks, keeping its own status and rating.
function import_title(database: SqlDatabase, title: ImportedTitle, collection_ids: string[]): "added" | "updated" {
  const db = drizzle_of(database);
  const existing = find_title(database, title);
  const { watched_episodes, collections: _collections, ...fields } = title;
  const id = existing || title.id;
  if (existing) {
    const row = db.select().from(library_titles).where(eq(library_titles.id, existing)).get()!;
    const fill = <Value>(mine: Value, theirs: Value) => (mine === "" || mine === 0 || mine === null ? theirs : mine);
    db.update(library_titles)
      .set({
        tmdb_id: fill(row.tmdb_id, fields.tmdb_id),
        imdb_id: fill(row.imdb_id, fields.imdb_id),
        trakt_id: fill(row.trakt_id, fields.trakt_id),
        overview: fill(row.overview, fields.overview),
        poster_path: fill(row.poster_path, fields.poster_path),
        genres: fill(row.genres, fields.genres),
        runtime: fill(row.runtime, fields.runtime),
        total_episodes: fill(row.total_episodes, fields.total_episodes),
        rating: fill(row.rating, fields.rating),
        last_watched: [row.last_watched, fields.last_watched].sort().at(-1)!,
      })
      .where(eq(library_titles.id, existing))
      .run();
  } else db.insert(library_titles).values(fields).run();

  const episodes = [...parse_episodes(watched_episodes)].flatMap(([season, numbers]) => [...numbers].map((episode) => ({ season, episode })));
  write_episodes(database, id, episodes, true);
  for (const collection_id of collection_ids) db.insert(library_title_collections).values({ title_id: id, collection_id }).onConflictDoNothing().run();
  return existing ? "updated" : "added";
}

// ── Feature ──────────────────────────────────────────────────────────────────

export const library_feature = define_feature({
  id: "library",
  migrations: migrations.map((migration) => migration.statements),
  tables: synced_tables(library_tables),
  setting_defaults: library_setting_defaults,
  secret_settings: library_secret_settings,
  methods: {
    list_library: (database: SqlDatabase): Library => {
      const db = drizzle_of(database);
      return {
        titles: list_titles(database),
        collections: db.select().from(library_collections).orderBy(asc(library_collections.name)).all(),
        groups: db.select().from(library_collection_groups).orderBy(asc(library_collection_groups.position), asc(library_collection_groups.name)).all(),
      };
    },

    get_title: (database: SqlDatabase, id: string): LibraryTitle | null => list_titles(database, [id])[0] ?? null,

    search_tmdb: async (database: SqlDatabase, query: string, media_type: MediaType | "all"): Promise<SearchResult[]> => {
      const results = await tmdb_of(database).search(query, media_type);
      return results.map((result) => ({ ...result, tracked_id: find_title(database, { tmdb_id: result.tmdb_id }) }));
    },

    // A title known only by its IMDb id keeps the TMDB id found for it, so the lookup happens once.
    lookup_title_details: async (database: SqlDatabase, id: string): Promise<TitleDetails> => {
      const title = require_title(database, id);
      const tmdb = tmdb_of(database);
      const tmdb_id = title.tmdb_id || (await resolve_details(tmdb, title.media_type, "", title.imdb_id)).tmdb_id;
      return { ...(await tmdb.full_details(title.media_type, tmdb_id)), title };
    },

    export_library: (database: SqlDatabase): string => {
      const names = new Map(drizzle_of(database).select().from(library_collections).all().map((collection) => [collection.id, collection.name]));
      return write_trilium_database(
        list_titles(database).map(({ collection_ids, watched_count: _watched_count, ...title }) => ({
          ...title,
          collections: collection_ids.map((id) => names.get(id)!).filter(Boolean),
        })),
      );
    },

    add_title: async (database: SqlDatabase, media_type: MediaType, tmdb_id: string): Promise<Added> => add_details(database, await tmdb_of(database).details(media_type, tmdb_id)),

    // An IMDb link does not say whether it is a movie or a show, so both are asked for; an id matches only one.
    add_title_from_link: async (database: SqlDatabase, link: string): Promise<Added> => {
      const parsed = parse_media_link(link);
      if (!parsed) throw new Error("Not a TMDB or IMDb link, such as https://www.themoviedb.org/movie/693134 or https://www.imdb.com/title/tt15239678/.");
      const tmdb = tmdb_of(database);
      if ("tmdb_id" in parsed) return add_details(database, await tmdb.details(parsed.media_type, parsed.tmdb_id));
      for (const media_type of ["movie", "show"] as const) {
        const tmdb_id = await tmdb.find_by_imdb(parsed.imdb_id, media_type);
        if (tmdb_id) return add_details(database, await tmdb.details(media_type, tmdb_id));
      }
      throw new Error(`TMDB has no match for ${parsed.imdb_id}.`);
    },

    remove_title: (database: SqlDatabase, id: string): void => {
      require_title(database, id);
      drizzle_of(database).delete(library_titles).where(eq(library_titles.id, id)).run();
    },

    set_title_status: (database: SqlDatabase, id: string, status: Status): void => {
      if (!is_status(status)) throw new Error(`Unknown status: ${String(status)}.`);
      require_title(database, id);
      drizzle_of(database)
        .update(library_titles)
        .set(status === "watched" ? { status, last_watched: today() } : { status })
        .where(eq(library_titles.id, id))
        .run();
    },

    set_title_rating: (database: SqlDatabase, id: string, rating: number | null): void => {
      if (rating !== null && !(Number.isFinite(rating) && rating >= 0 && rating <= 10)) throw new Error("A rating is 1 to 10, or none.");
      require_title(database, id);
      drizzle_of(database)
        .update(library_titles)
        .set({ rating: rating ? rating : null })
        .where(eq(library_titles.id, id))
        .run();
    },

    // Marks runs of episodes in one write, such as a whole season; total_episodes, when known, decides "all watched".
    set_episodes_watched: (database: SqlDatabase, id: string, ranges: EpisodeRange[], watched: boolean, total_episodes: number): LibraryTitle => {
      require_title(database, id);
      in_transaction(database, () => {
        if (total_episodes > 0) drizzle_of(database).update(library_titles).set({ total_episodes }).where(eq(library_titles.id, id)).run();
        write_episodes(database, id, episodes_in(ranges), watched);
        if (watched) drizzle_of(database).update(library_titles).set({ last_watched: today() }).where(eq(library_titles.id, id)).run();
        settle_status(database, id);
      });
      return require_title(database, id);
    },

    set_title_collections: (database: SqlDatabase, id: string, collection_ids: string[]): void => {
      require_title(database, id);
      in_transaction(database, () => {
        const db = drizzle_of(database);
        db.delete(library_title_collections).where(eq(library_title_collections.title_id, id)).run();
        for (const collection_id of new Set(collection_ids)) db.insert(library_title_collections).values({ title_id: id, collection_id }).run();
      });
    },

    // Adds a collection, or renames or regroups one; a name already in use, whatever its case, merges the two.
    save_collection: (database: SqlDatabase, collection: { id?: string; name: string; group_id: string | null }): string => {
      const name = collection.name.trim();
      if (!name) throw new Error("A collection needs a name.");
      return in_transaction(database, () => {
        const db = drizzle_of(database);
        const same_name = db
          .select()
          .from(library_collections)
          .all()
          .find((other) => other.name.toLowerCase() === name.toLowerCase() && other.id !== collection.id);
        if (!collection.id) {
          if (same_name) return same_name.id;
          const id = new_id();
          db.insert(library_collections).values({ id, name, group_id: collection.group_id }).run();
          return id;
        }
        if (same_name) {
          const titles = db.select({ title_id: library_title_collections.title_id }).from(library_title_collections).where(eq(library_title_collections.collection_id, collection.id)).all();
          for (const { title_id } of titles) db.insert(library_title_collections).values({ title_id, collection_id: same_name.id }).onConflictDoNothing().run();
          db.delete(library_collections).where(eq(library_collections.id, collection.id)).run();
          return same_name.id;
        }
        db.update(library_collections).set({ name, group_id: collection.group_id }).where(eq(library_collections.id, collection.id)).run();
        return collection.id;
      });
    },

    // Its titles stay; they only lose the collection.
    remove_collection: (database: SqlDatabase, id: string): void => void drizzle_of(database).delete(library_collections).where(eq(library_collections.id, id)).run(),

    save_collection_group: (database: SqlDatabase, group: { id?: string; name: string }): string => {
      const name = group.name.trim();
      if (!name) throw new Error("A group needs a name.");
      const db = drizzle_of(database);
      if (!group.id) return group_named(database, name);
      db.update(library_collection_groups).set({ name }).where(eq(library_collection_groups.id, group.id)).run();
      return group.id;
    },

    // Its collections stay, in no group.
    remove_collection_group: (database: SqlDatabase, id: string): void => void drizzle_of(database).delete(library_collection_groups).where(eq(library_collection_groups.id, id)).run(),

    move_collection_group: (database: SqlDatabase, id: string, step: -1 | 1): void => {
      const db = drizzle_of(database);
      const groups = db.select({ id: library_collection_groups.id }).from(library_collection_groups).orderBy(asc(library_collection_groups.position), asc(library_collection_groups.name)).all();
      const from = groups.findIndex((group) => group.id === id);
      const to = from + step;
      if (from < 0 || to < 0 || to >= groups.length) return;
      [groups[from], groups[to]] = [groups[to]!, groups[from]!];
      in_transaction(database, () => groups.forEach((group, position) => db.update(library_collection_groups).set({ position }).where(eq(library_collection_groups.id, group.id)).run()));
    },

    // Fetches every title's metadata again, fills in missing ids and episode counts, and sets each show's status from its
    // episodes; it never changes a rating or unwatches an episode.
    refresh_library: async (database: SqlDatabase): Promise<RefreshReport> => {
      const titles = list_titles(database);
      const has_key = setting(database, "library.tmdb_api_key").trim() !== "";
      const tmdb = has_key ? tmdb_of(database) : null;
      const report: RefreshReport = { total: titles.length, metadata_updated: 0, status_updated: 0, failed: 0 };
      for (const title of titles) {
        if (tmdb) {
          try {
            const details = await resolve_details(tmdb, title.media_type, title.tmdb_id, title.imdb_id);
            const fields = {
              ...metadata_of(details),
              imdb_id: details.imdb_id || title.imdb_id,
              name: details.name || title.name,
              poster_path: details.poster_path || title.poster_path,
              total_episodes: details.total_episodes || title.total_episodes,
            };
            const changed = (Object.keys(fields) as (keyof typeof fields)[]).some((key) => fields[key] !== title[key]);
            if (changed) {
              drizzle_of(database).update(library_titles).set(fields).where(eq(library_titles.id, title.id)).run();
              report.metadata_updated++;
            }
          } catch {
            report.failed++;
          }
        }
        if (title.media_type === "show" && settle_status(database, title.id) !== title.status) report.status_updated++;
      }
      return report;
    },

    // The Trilium Media Tracker's Database note, and optionally its collection groups setting; adds and merges, never removes.
    import_trilium_media: (database: SqlDatabase, database_json: string, groups_json: string): ImportReport => {
      const titles = read_trilium_database(database_json);
      const groups = read_trilium_groups(groups_json);
      return in_transaction(database, () => {
        const group_ids = new Map(groups.groups.map((name) => [name, group_named(database, name)]));
        for (const [key, group] of Object.entries(groups.group_of)) collection_named(database, groups.names[key] ?? key, group_ids.get(group) ?? null);
        const report: ImportReport = { added: 0, updated: 0 };
        for (const title of titles) {
          const collection_ids = normalize_names(title.collections).map((name) => collection_named(database, name, group_ids.get(groups.group_of[name.toLowerCase()] ?? "") ?? null));
          report[import_title(database, title, collection_ids)]++;
        }
        return report;
      });
    },
  },
  api: library_api,
});
