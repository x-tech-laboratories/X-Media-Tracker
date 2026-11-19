// The games' tables, from which drizzle-kit writes the migrations and the store reads its row types.

// ── Imports ──────────────────────────────────────────────────────────────────

import { index, integer, primaryKey, real, sqliteTable, text } from "@x-tech-laboratories/x-libs/drizzle";

// ── Tables ───────────────────────────────────────────────────────────────────

export const games_collections = sqliteTable("games_collections", {
  id: text().primaryKey(),
  name: text().notNull(),
});

// A game's id is its strongest id, such as "rawg:portal-2" or "steam:620", so two devices adding the same game make one row.
export const games_games = sqliteTable(
  "games_games",
  {
    id: text().primaryKey(),
    rawg_id: text().notNull().default(""),
    mobygames_id: text().notNull().default(""),
    giantbomb_id: text().notNull().default(""),
    wikidata_id: text().notNull().default(""),
    steam_app_id: text().notNull().default(""),
    igdb_id: text().notNull().default(""),
    title: text().notNull(),
    year: text().notNull().default(""),
    release_date: text().notNull().default(""),
    overview: text().notNull().default(""),
    cover_url: text().notNull().default(""),
    // The full image kept on every device, by its synced file's name, and the address it was taken from ("custom" when set by hand).
    cover_file: text().notNull().default(""),
    cover_file_from: text().notNull().default(""),
    genres: text().notNull().default(""),
    platforms: text().notNull().default(""),
    developers: text().notNull().default(""),
    publishers: text().notNull().default(""),
    // An older status, read as Backlog; changing the default would rebuild the table and drop its collection links.
    status: text().notNull().default("want_to_play"),
    rating: real(),
    review: text().notNull().default(""),
    // Your own notes, as Markdown.
    notes: text().notNull().default(""),
    // The platforms a copy is owned on, as a JSON list.
    owned_platforms: text().notNull().default("[]"),
    edition: text().notNull().default(""),
    playtime_minutes: integer().notNull().default(0),
    last_played: text().notNull().default(""),
    added_at: text().notNull().default(""),
    // The game this is DLC of, by its key such as "steam:620" or a library id; "none" once set by hand as not DLC.
    base_game: text().notNull().default(""),
    base_game_title: text().notNull().default(""),
  },
  (table) => [
    index("games_games_by_rawg").on(table.rawg_id),
    index("games_games_by_mobygames").on(table.mobygames_id),
    index("games_games_by_giantbomb").on(table.giantbomb_id),
    index("games_games_by_wikidata").on(table.wikidata_id),
    index("games_games_by_steam").on(table.steam_app_id),
  ],
);

export const games_game_collections = sqliteTable(
  "games_game_collections",
  {
    game_id: text()
      .notNull()
      .references(() => games_games.id, { onDelete: "cascade" }),
    collection_id: text()
      .notNull()
      .references(() => games_collections.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.game_id, table.collection_id] }), index("games_game_collections_by_collection").on(table.collection_id)],
);

// Parents first, as sync applies them.
export const games_tables = [games_collections, games_games, games_game_collections];
