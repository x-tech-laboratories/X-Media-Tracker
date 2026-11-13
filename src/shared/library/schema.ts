// The library's tables, from which drizzle-kit writes the migrations and the store reads its row types.

// ── Imports ──────────────────────────────────────────────────────────────────

import { index, integer, primaryKey, real, sqliteTable, text } from "@x-tech-laboratories/x-libs/drizzle";

// ── Tables ───────────────────────────────────────────────────────────────────

export const library_collection_groups = sqliteTable("library_collection_groups", {
  id: text().primaryKey(),
  name: text().notNull(),
  position: integer().notNull().default(0),
});

export const library_collections = sqliteTable("library_collections", {
  id: text().primaryKey(),
  name: text().notNull(),
  group_id: text().references(() => library_collection_groups.id, { onDelete: "set null" }),
});

// A title's id is its strongest id, such as "tmdb:693134", so two devices adding the same title make one row.
export const library_titles = sqliteTable(
  "library_titles",
  {
    id: text().primaryKey(),
    tmdb_id: text().notNull().default(""),
    imdb_id: text().notNull().default(""),
    trakt_id: text().notNull().default(""),
    media_type: text().notNull(),
    name: text().notNull(),
    year: text().notNull().default(""),
    overview: text().notNull().default(""),
    poster_path: text().notNull().default(""),
    genres: text().notNull().default(""),
    runtime: integer().notNull().default(0),
    status: text().notNull().default("planned"),
    rating: real(),
    last_watched: text().notNull().default(""),
    total_episodes: integer().notNull().default(0),
    added_at: text().notNull().default(""),
  },
  (table) => [index("library_titles_by_tmdb").on(table.tmdb_id), index("library_titles_by_imdb").on(table.imdb_id)],
);

export const library_episodes = sqliteTable(
  "library_episodes",
  {
    title_id: text()
      .notNull()
      .references(() => library_titles.id, { onDelete: "cascade" }),
    season: integer().notNull(),
    episode: integer().notNull(),
    watched_at: text().notNull().default(""),
  },
  (table) => [primaryKey({ columns: [table.title_id, table.season, table.episode] })],
);

export const library_title_collections = sqliteTable(
  "library_title_collections",
  {
    title_id: text()
      .notNull()
      .references(() => library_titles.id, { onDelete: "cascade" }),
    collection_id: text()
      .notNull()
      .references(() => library_collections.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.title_id, table.collection_id] }), index("library_title_collections_by_collection").on(table.collection_id)],
);

// Parents first, as sync applies them.
export const library_tables = [library_collection_groups, library_collections, library_titles, library_episodes, library_title_collections];
