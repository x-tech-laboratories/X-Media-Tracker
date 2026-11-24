import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import { bind_methods, open_store } from "../src/shared/store.ts";
import { is_blank, meet_row, read_transfer, transfer_csv, type TransferTable } from "../src/shared/transfer.ts";
import { seed_library } from "./library_sample.ts";

// ── Helpers ──────────────────────────────────────────────────────────────────

function store() {
  const database = new DatabaseSync(":memory:");
  open_store(database);
  return { database, methods: bind_methods(() => database, () => undefined) };
}

// ── Files ────────────────────────────────────────────────────────────────────

describe("transfer files", () => {
  const tables: TransferTable[] = [{ name: "things", required: true, columns: { id: "text", count: "number", rating: "nullable_number", done: "boolean" } }];

  it("writes a CSV file per table and reads each cell back as its column's type", () => {
    const files = transfer_csv(tables, { things: [{ id: "a, b", count: 3, rating: null, done: true, other: "left out" }] });
    expect(files).toEqual({ "things.csv": 'id,count,rating,done\r\n"a, b",3,,1\r\n' });
    expect(read_transfer("movies", tables, { csv: { "export/Things.csv": files["things.csv"]! } })).toEqual({ things: [{ id: "a, b", count: 3, rating: null, done: true }] });
  });

  it("leaves out a column the file does not have, so it changes nothing", () => {
    expect(read_transfer("movies", tables, { csv: { "things.csv": "id\r\nx\r\n" } })).toEqual({ things: [{ id: "x" }] });
  });

  it("refuses another kind's export, a missing table and a value of the wrong type", () => {
    const file = { app: "x-media-tracker", kind: "books", version: 1, tables: { things: [] } };
    expect(() => read_transfer("movies", tables, { json: file })).toThrow("That file is an export of books, not of movies.");
    expect(() => read_transfer("movies", tables, { json: "{" })).toThrow("That file is not JSON.");
    expect(() => read_transfer("movies", tables, { json: { tables: {} } })).toThrow("not an X-Media-Tracker export");
    expect(() => read_transfer("movies", tables, { json: { ...file, kind: "movies", tables: {} } })).toThrow("The file has no things.");
    expect(() => read_transfer("movies", tables, { csv: {} })).toThrow("No things.csv among the files.");
    expect(() => read_transfer("movies", tables, { json: { ...file, kind: "movies", tables: { things: [{ count: "3" }] } } })).toThrow("things 1's count must be a number.");
    expect(() => read_transfer("movies", tables, { csv: { "things.csv": "count\r\nlots\r\n" } })).toThrow("Row 2 of things.csv: count must be a number.");
  });

  it("fills what the tracked item lacks and calls a different value of the user's own a conflict", () => {
    expect(is_blank("[]")).toBe(true);
    expect(meet_row({ notes: "", genres: "Drama", rating: 7 }, { notes: "Loved it", genres: "Crime", rating: 7 }, ["rating", "notes"])).toEqual({ fill: { notes: "Loved it" }, conflict: false });
    expect(meet_row({ rating: 7 }, { rating: 9 }, ["rating"])).toEqual({ fill: {}, conflict: true });
    expect(meet_row({ rating: 7 }, { rating: null }, ["rating"])).toEqual({ fill: {}, conflict: false });
  });
});

// ── Movies & Series ──────────────────────────────────────────────────────────

describe("Movies & Series files", () => {
  it("carries the whole library into an empty one, through JSON and through CSV", () => {
    const from = store();
    seed_library(from.database, { groups: true });
    const json = from.methods.export_library_json();
    const csv = from.methods.export_library_csv();
    expect(Object.keys(csv)).toEqual(["titles.csv", "episodes.csv", "collection_groups.csv", "collections.csv", "title_collections.csv"]);

    for (const input of [{ json: JSON.parse(JSON.stringify(json)) }, { csv }]) {
      const to = store();
      expect(to.methods.import_library_file(input)).toEqual({ added: 3, updated: 0, unchanged: 0, conflicts: [] });
      const library = to.methods.list_library();
      const severance = library.titles.find((title) => title.id === "tmdb:95396")!;
      expect(severance.watched_episodes).toBe("s01e01-e09,s02e01");
      expect(severance.collection_ids.map((id) => library.collections.find((collection) => collection.id === id)!.name).sort()).toEqual(["Apple", "Comfort"]);
      expect(library.collections.find((collection) => collection.name === "Dune")!.group_id).toBe(library.groups.find((group) => group.name === "Franchise")!.id);
      expect(library.titles.find((title) => title.id === "tmdb:693134")).toMatchObject({ rating: 9, status: "watched", imdb_id: "tt15239678" });
    }
  });

  it("carries a title known only by another catalogue's id, and finds it by that id coming back", () => {
    const from = store();
    from.database.exec(`INSERT INTO library_titles (id, media_type, name, other_ids) VALUES ('shelfdb:8', 'movie', 'A Short Film', '{"shelfdb":"8"}')`);
    const to = store();

    expect(to.methods.import_library_file({ csv: from.methods.export_library_csv() })).toMatchObject({ added: 1 });
    expect(to.methods.get_title("shelfdb:8")).toMatchObject({ other_ids: { shelfdb: "8" } });
    expect(to.methods.import_library_file({ json: from.methods.export_library_json() })).toMatchObject({ added: 0, unchanged: 1 });
  });

  it("changes nothing when the library's own export comes back", () => {
    const { methods, database } = store();
    seed_library(database);
    expect(methods.import_library_file({ json: methods.export_library_json() })).toEqual({ added: 0, updated: 0, unchanged: 3, conflicts: [] });
  });

  it("matches a title by any id, adds its episodes and fills its blanks, and offers a different rating to settle", () => {
    const { methods, database } = store();
    seed_library(database);
    const titles = [
      { id: "tmdb:95396", tmdb_id: "95396", imdb_id: "tt11280740", media_type: "show", name: "Severance", status: "watching", notes: "Season 2!", rating: null },
      { id: "imdb:tt15239678", tmdb_id: "", imdb_id: "tt15239678", media_type: "movie", name: "Dune: Part Two", status: "watched", rating: 7 },
    ];
    const episodes = [{ title_id: "tmdb:95396", season: 2, episode: 2, watched_at: "2026-11-01" }];
    const report = methods.import_library_file({ json: { app: "x-media-tracker", kind: "movies", version: 1, tables: { titles, episodes } } });

    expect(report).toMatchObject({ added: 0, updated: 1, unchanged: 1 });
    expect(report.conflicts).toEqual([{ id: "tmdb:693134", name: "Dune: Part Two", values: { tmdb_id: "", imdb_id: "tt15239678", media_type: "movie", name: "Dune: Part Two", status: "watched", rating: 7 } }]);
    const severance = methods.get_title("tmdb:95396")!;
    expect(severance).toMatchObject({ imdb_id: "tt11280740", notes: "Season 2!", watched_episodes: "s01e01-e09,s02e01-e02" });
    expect(methods.get_title("tmdb:693134")!.rating).toBe(9);

    methods.merge_titles(["tmdb:693134"], "tmdb:693134", { rating: 7 });
    expect(methods.get_title("tmdb:693134")!.rating).toBe(7);
  });

  it("refuses a title with no name or kind before writing anything", () => {
    const { methods } = store();
    const titles = [{ id: "tmdb:1", tmdb_id: "1", media_type: "movie", name: "One" }, { id: "tmdb:2", tmdb_id: "2", media_type: "movie", name: "" }];
    expect(() => methods.import_library_file({ json: { app: "x-media-tracker", kind: "movies", version: 1, tables: { titles } } })).toThrow("Title 2 has no name.");
    expect(() => methods.import_library_file({ csv: { "titles.csv": "id,name,media_type\r\nx,X,book\r\n" } })).toThrow("X is neither a movie nor a show.");
    expect(methods.list_library().titles).toEqual([]);
  });
});

// ── Books ────────────────────────────────────────────────────────────────────

function seed_books(database: DatabaseSync): void {
  database.exec(`
    INSERT INTO books_books (id, isbn, title, authors, status, rating, owned, author_refs) VALUES
      ('isbn:9780441013593', '9780441013593', 'Dune', 'Frank Herbert', 'read', 8, 1, '[{"name":"Frank Herbert"}]'),
      ('title:emma/jane austen', '', 'Emma', 'Jane Austen', 'want_to_read', NULL, 0, '[]');
    INSERT INTO books_reads (id, book_id, started_on, finished_on, format, dnf) VALUES ('read-1', 'isbn:9780441013593', '2026-01-02', '2026-01-20', 'paperback', 0);
    INSERT INTO books_journal (id, book_id, written_on, page, text) VALUES ('note-1', 'isbn:9780441013593', '2026-01-05', 120, 'The spice must flow.');
    INSERT INTO books_collections (id, name) VALUES ('collection-1', 'Classics');
    INSERT INTO books_book_collections (book_id, collection_id) VALUES ('title:emma/jane austen', 'collection-1');
    INSERT INTO books_follows (id, kind, name, openlibrary_id, checked_at) VALUES ('author:openlibrary:OL1A', 'author', 'Frank Herbert', 'OL1A', '2026-01-01');
    INSERT INTO books_goals (year, target) VALUES ('2026', 24);
  `);
}

describe("Books files", () => {
  it("carries books, reads, journal, collections, follows and goals into an empty library through CSV", () => {
    const from = store();
    seed_books(from.database);
    from.database.exec(`INSERT INTO books_books (id, title, authors, other_ids) VALUES ('shelfdb:7', 'Piranesi', 'Susanna Clarke', '{"shelfdb":"7"}')`);
    const to = store();

    expect(to.methods.import_books_file({ csv: from.methods.export_books_csv() })).toEqual({ added: 3, updated: 0, unchanged: 0, conflicts: [] });
    expect(to.methods.get_book("shelfdb:7")).toMatchObject({ other_ids: { shelfdb: "7" } });
    // Coming back, it is found by its id from ShelfDB and nothing changes.
    expect(to.methods.import_books_file({ csv: from.methods.export_books_csv() })).toMatchObject({ added: 0, unchanged: 3 });
    const dune = to.methods.get_book("isbn:9780441013593")!;
    expect(dune).toMatchObject({ owned: true, rating: 8, last_read: "2026-01-20", author_refs: [{ name: "Frank Herbert" }] });
    expect(dune.reads).toHaveLength(1);
    expect(to.methods.list_book_journal("isbn:9780441013593")).toEqual([expect.objectContaining({ page: 120, text: "The spice must flow." })]);
    expect(to.database.prepare("SELECT checked_at FROM books_follows").get()).toEqual({ checked_at: "" });
    expect(to.database.prepare("SELECT target FROM books_goals WHERE year = '2026'").get()).toEqual({ target: 24 });
  });

  it("adds no read or journal entry twice, and offers a different status to settle", () => {
    const { methods, database } = store();
    seed_books(database);
    const file = methods.export_books_json();
    file.tables.books![0] = { ...file.tables.books![0], status: "reading", progress: 0 };
    file.tables.reads!.push({ id: "read-2", book_id: "isbn:9780441013593", started_on: "2026-01-02", finished_on: "2026-01-20", format: "", dnf: 0 });

    const report = methods.import_books_file({ json: file });
    expect(report).toMatchObject({ added: 0, updated: 0, unchanged: 2 });
    expect(report.conflicts).toEqual([{ id: "isbn:9780441013593", name: "Dune", values: expect.objectContaining({ status: "reading", owned: true, author_refs: [{ name: "Frank Herbert" }] }) }]);
    expect(methods.get_book("isbn:9780441013593")!.reads).toHaveLength(1);
  });
});

// ── Games ────────────────────────────────────────────────────────────────────

describe("Games files", () => {
  it("carries games and their collections into an empty library, pointing DLC at its base game", () => {
    const from = store();
    from.database.exec(`
      INSERT INTO games_games (id, steam_app_id, title, status, owned_platforms, playtime_minutes) VALUES ('steam:620', '620', 'Portal 2', 'played', '["PC"]', 600);
      INSERT INTO games_games (id, title, base_game) VALUES ('title:portal 2 dlc', 'Portal 2 DLC', 'steam:620');
      INSERT INTO games_games (id, title, other_ids) VALUES ('shelfdb:7', 'Outer Wilds', '{"shelfdb":"7"}');
      INSERT INTO games_collections (id, name) VALUES ('collection-1', 'Puzzles');
      INSERT INTO games_game_collections (game_id, collection_id) VALUES ('steam:620', 'collection-1');
    `);
    const to = store();

    expect(to.methods.import_games_file({ json: JSON.stringify(from.methods.export_games_json()) })).toEqual({ added: 3, updated: 0, unchanged: 0, conflicts: [] });
    expect(to.methods.get_game("steam:620")).toMatchObject({ owned_platforms: ["PC"], playtime_minutes: 600, collection_ids: [expect.any(String)] });
    expect(to.methods.get_game("shelfdb:7")).toMatchObject({ other_ids: { shelfdb: "7" } });
    expect(to.methods.get_game("title:portal 2 dlc")!.base_game).toBe("steam:620");
  });

  it("keeps the larger playtime without asking and offers different owned platforms to settle", () => {
    const { methods, database } = store();
    database.exec(`INSERT INTO games_games (id, steam_app_id, title, owned_platforms, playtime_minutes) VALUES ('steam:620', '620', 'Portal 2', '["PC"]', 600)`);
    const games = [{ id: "steam:620", steam_app_id: "620", title: "Portal 2", owned_platforms: '["PC","Switch"]', playtime_minutes: 900 }];

    const report = methods.import_games_file({ csv: transfer_csv([{ name: "games", columns: { id: "text", steam_app_id: "text", title: "text", owned_platforms: "text", playtime_minutes: "number" } }], { games }) });
    expect(report).toMatchObject({ added: 0, updated: 1 });
    expect(report.conflicts).toEqual([{ id: "steam:620", name: "Portal 2", values: expect.objectContaining({ owned_platforms: ["PC", "Switch"] }) }]);
    expect(methods.get_game("steam:620")!.playtime_minutes).toBe(900);
  });
});

// ── Settings ─────────────────────────────────────────────────────────────────

describe("Settings files", () => {
  it("leaves out keys and tokens unless asked, and an import keeps the keys the file leaves out", () => {
    const from = store();
    from.methods.set_setting("library.poster_size", "w342");
    from.methods.set_setting("library.tmdb_api_key", "not-a-real-key");
    expect(from.methods.export_settings(false).settings).toEqual({ "library.poster_size": "w342" });
    expect(from.methods.export_settings(true).settings).toMatchObject({ "library.tmdb_api_key": "not-a-real-key" });

    const to = store();
    to.methods.set_setting("library.tmdb_api_key", "this-device-key");
    to.methods.set_setting("library.poster_size", "w342");
    expect(to.methods.import_settings(JSON.stringify(from.methods.export_settings(false)))).toEqual({ changed: 0, unchanged: 1 });
    expect(to.methods.get_settings()["library.tmdb_api_key"]).toBe("this-device-key");
    expect(to.methods.import_settings(from.methods.export_settings(true))).toEqual({ changed: 1, unchanged: 1 });
    expect(() => to.methods.import_settings(from.methods.export_library_json())).toThrow("not an X-Media-Tracker settings export");
  });
});
