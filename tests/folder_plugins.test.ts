import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { read_plugin_file } from "@x-tech-laboratories/x-libs/plugin_folder";
import { define_plugin } from "@x-tech-laboratories/x-libs/plugins";
import { hash_password } from "@x-tech-laboratories/x-libs/server/passwords";
import { afterEach, describe, expect, it, vi } from "vitest";

import { build_app } from "../src/server/app.ts";
import { empty_book } from "../src/shared/books/catalog.ts";
import { book_catalog_manifests } from "../src/shared/books/manifests.ts";
import { empty_game } from "../src/shared/games/catalog.ts";
import { empty_title } from "../src/shared/library/plugins.ts";
import { game_catalog_manifests } from "../src/shared/games/manifests.ts";
import { app_info } from "../src/shared/plugins/app.ts";
import { use_folder_plugins, type MediaPluginApi } from "../src/shared/plugins/host.ts";
import { bind_methods, open_store } from "../src/shared/store.ts";

// ── Stand-ins ────────────────────────────────────────────────────────────────

// A plugin as one from the plugins folder would be: an importer that writes through the services it is handed.
const shelf_plugin = define_plugin<MediaPluginApi>({
  id: "someone.shelf",
  name: "Shelf",
  version: "1.0.0",
  app: app_info.id,
  start: (context) =>
    context.provide("importer", "shelf", {
      label: "Shelf",
      is_ready: () => true,
      run: async (database) =>
        context.services.import_books(database, [
          { title: "Piranesi", authors: "Susanna Clarke", isbn: "", format: "print", status: "read", added_at: "2026-11-01", last_read: "", reads: [], rating: 9, review: "", moods: "", pace: "", tags: [], owned: true },
        ]),
      imports_automatically: () => false,
    }),
});

// A plugins folder with one plugin whose web side is built.
function plugins_folder(): string {
  const folder = mkdtempSync(join(tmpdir(), "x-media-plugins-"));
  mkdirSync(join(folder, "shelf", "dist"), { recursive: true });
  writeFileSync(join(folder, "shelf", "package.json"), JSON.stringify({ type: "module", "x-plugin": { store: "dist/store.js", web: "dist/web.js" } }));
  writeFileSync(join(folder, "shelf", "dist", "web.js"), "export default { id: 'someone.shelf' };");
  writeFileSync(join(folder, "secret.txt"), "not a plugin's");
  return folder;
}

afterEach(() => use_folder_plugins([]));

// ── Store ────────────────────────────────────────────────────────────────────

describe("a plugin from the plugins folder", () => {
  it("adds its importer to the sources, writes through the services, and stops while off", async () => {
    use_folder_plugins([shelf_plugin]);
    const database = new DatabaseSync(":memory:");
    open_store(database);
    const store = bind_methods(() => database, () => undefined);

    expect(await store.list_sources()).toContainEqual(expect.objectContaining({ id: "shelf", plugin_id: "someone.shelf", label: "Shelf" }));
    expect(await store.run_source_import("shelf")).toEqual({ added: 1, updated: 0 });
    expect(store.list_books().books).toContainEqual(expect.objectContaining({ title: "Piranesi", rating: 9 }));

    store.set_setting("plugins", { "someone.shelf": { enabled: false } });
    expect((await store.list_sources()).map((source) => source.id)).not.toContain("shelf");
  });
});

// ── Files ────────────────────────────────────────────────────────────────────

describe("the plugins folder's files", () => {
  it("lists the web entries and gives each plugin's own files, never one outside its folder, on the desktop", () => {
    const folder = plugins_folder();

    expect(JSON.parse(read_plugin_file(folder, "index.json"))).toEqual({ entries: ["shelf/dist/web.js"], problems: [] });
    expect(read_plugin_file(folder, "shelf/dist/web.js")).toContain("someone.shelf");
    expect(read_plugin_file(folder, "shelf/../secret.txt")).toBe("");
    expect(read_plugin_file(folder, "shelf/missing.js")).toBe("");
  });

  it("are served to a signed-in page by the server", async () => {
    const database = new DatabaseSync(":memory:");
    open_store(database);
    const password = "correct horse battery staple";
    const app = await build_app({
      database,
      declared: new Map([["root", hash_password(password)]]),
      web_folder: "/nonexistent",
      plugins_folder: plugins_folder(),
      backups: { list_backups: () => [], create_backup: async () => ({ name: "", size: 0, created_at: "" }), restore_backup: async () => undefined, remove_backup: () => undefined, get_backup_schedule: () => ({ every_hours: 0, keep: 0 }), set_backup_schedule: () => undefined } as never,
    });
    const token = (await app.inject({ method: "POST", url: "/api/login", payload: { name: "root", password, device: "tests" } })).json().token as string;

    expect((await app.inject({ method: "GET", url: "/api/plugins/index.json" })).statusCode).toBe(401);
    const index = await app.inject({ method: "GET", url: "/api/plugins/index.json", headers: { authorization: `Bearer ${token}` } });
    expect(index.json()).toEqual({ entries: ["shelf/dist/web.js"], problems: [] });
    await app.close();
  });
});

// ── Catalogues ───────────────────────────────────────────────────────────────

// A game catalogue as one from the plugins folder would be, keeping its ids under its own source name.
const shelfdb_plugin = define_plugin<MediaPluginApi>({
  id: "someone.shelfdb",
  name: "ShelfDB",
  version: "1.0.0",
  app: app_info.id,
  start: (context) => {
    const game = (id: string) => ({ ...empty_game("shelfdb"), other_ids: { shelfdb: id }, title: id === "7" ? "Outer Wilds" : "Tunic", year: "2019", overview: `Game ${id} from ShelfDB.` });
    context.provide("game_catalog", "shelfdb", {
      source: "shelfdb",
      label: "ShelfDB",
      missing: "",
      stage: "details",
      game: async (id) => game(id),
      search: async () => [game("7")],
    });
  },
});

describe("a game catalogue from the plugins folder", () => {
  function open_with_shelfdb() {
    use_folder_plugins([shelfdb_plugin]);
    const database = new DatabaseSync(":memory:");
    open_store(database);
    const store = bind_methods(() => database, () => undefined);
    // The built-in catalogues are off, so only ShelfDB answers.
    store.set_setting("plugins", Object.fromEntries(game_catalog_manifests.map((manifest) => [manifest.id, { enabled: false }])));
    return store;
  }

  it("is searched under its own name and adds a game kept by its id", async () => {
    const store = open_with_shelfdb();

    const search = await store.search_games("outer");
    expect(search.results).toEqual([expect.objectContaining({ title: "Outer Wilds", other_ids: { shelfdb: "7" }, sources: ["shelfdb"] })]);
    expect(search.labels.shelfdb).toBe("ShelfDB");

    expect(await store.add_game("shelfdb", "7")).toEqual({ id: "shelfdb:7", title: "Outer Wilds", existed: false });
    expect(store.get_game("shelfdb:7")).toMatchObject({ other_ids: { shelfdb: "7" }, overview: "Game 7 from ShelfDB." });
    expect((await store.add_game("shelfdb", "7")).existed).toBe(true);
    expect((await store.lookup_game_sources("shelfdb:7")).answers).toEqual([expect.objectContaining({ source: "shelfdb", label: "ShelfDB" })]);
  });

  it("keeps every merged game's ids from it on the one kept", async () => {
    const store = open_with_shelfdb();
    await store.add_game("shelfdb", "7");
    await store.add_game("shelfdb", "8");

    const merged = store.merge_games(["shelfdb:7", "shelfdb:8"], "shelfdb:7", {});

    expect(merged.other_ids).toEqual({ shelfdb: "7" });
    expect(store.get_game("shelfdb:8")).toBeNull();
  });

  it("takes its id typed by hand, refusing one another game has and clearing one left empty", async () => {
    const store = open_with_shelfdb();
    await store.add_game("shelfdb", "7");
    await store.add_game("shelfdb", "8");
    expect(await store.list_folder_game_catalogs()).toEqual([{ source: "shelfdb", label: "ShelfDB" }]);

    await expect(store.set_game_ids("shelfdb:8", { other_ids: { shelfdb: "7" } })).rejects.toThrow("Outer Wilds already has that shelfdb id");
    expect((await store.set_game_ids("shelfdb:8", { other_ids: { shelfdb: " 9 ", rawg: "portal-2" } })).other_ids).toEqual({ shelfdb: "9" });
    expect(store.get_game("shelfdb:8")).toMatchObject({ rawg_id: "", overview: "Game 9 from ShelfDB." });
    expect((await store.set_game_ids("shelfdb:8", { other_ids: { shelfdb: "" } })).other_ids).toEqual({});
  });
});

// A book catalogue as one from the plugins folder would be, with no authors or series to follow.
const shelf_books_plugin = define_plugin<MediaPluginApi>({
  id: "someone.shelf-books",
  name: "ShelfDB Books",
  version: "1.0.0",
  app: app_info.id,
  start: (context) => {
    const book = (id: string) => ({ ...empty_book("shelfdb"), other_ids: { shelfdb: id }, title: id === "7" ? "Piranesi" : "Jonathan Strange", year: "2020", overview: `Book ${id} from ShelfDB.` });
    context.provide("book_catalog", "shelfdb", { source: "shelfdb", label: "ShelfDB Books", missing: "", book: async (id) => book(id), search: async () => [book("7")] });
  },
});

describe("a book catalogue from the plugins folder", () => {
  function open_with_shelf_books() {
    use_folder_plugins([shelf_books_plugin]);
    const database = new DatabaseSync(":memory:");
    open_store(database);
    const store = bind_methods(() => database, () => undefined);
    // The built-in catalogues are off, so only ShelfDB answers.
    store.set_setting("plugins", Object.fromEntries(book_catalog_manifests.map((manifest) => [manifest.id, { enabled: false }])));
    return store;
  }

  it("is searched under its own name and adds a book kept by its id", async () => {
    const store = open_with_shelf_books();

    const search = await store.search_books("piranesi");
    expect(search.results).toEqual([expect.objectContaining({ title: "Piranesi", other_ids: { shelfdb: "7" }, sources: ["shelfdb"] })]);
    expect(search.labels.shelfdb).toBe("ShelfDB Books");

    expect(await store.add_book("shelfdb", "7")).toEqual({ id: "shelfdb:7", title: "Piranesi", existed: false });
    expect(store.get_book("shelfdb:7")).toMatchObject({ other_ids: { shelfdb: "7" }, overview: "Book 7 from ShelfDB." });
    expect((await store.add_book("shelfdb", "7")).existed).toBe(true);
    expect((await store.lookup_book_sources("shelfdb:7")).answers).toEqual([expect.objectContaining({ source: "shelfdb", label: "ShelfDB Books" })]);
    expect(await store.search_book_people("piranesi", "author")).toEqual([]);
  });

  it("refuses a catalogue that is not on", async () => {
    const store = open_with_shelf_books();
    await expect(store.add_book("nowhere", "1")).rejects.toThrow("No catalogue named nowhere is on.");
  });

  it("keeps every merged book's ids from it on the one kept", async () => {
    const store = open_with_shelf_books();
    await store.add_book("shelfdb", "7");
    await store.add_book("shelfdb", "8");

    const merged = store.merge_books(["shelfdb:7", "shelfdb:8"], "shelfdb:7", {});

    expect(merged.other_ids).toEqual({ shelfdb: "7" });
    expect(store.get_book("shelfdb:8")).toBeNull();
  });

  it("takes its id typed by hand, refusing one another book has and clearing one left empty", async () => {
    const store = open_with_shelf_books();
    await store.add_book("shelfdb", "7");
    await store.add_book("shelfdb", "8");
    expect(await store.list_folder_book_catalogs()).toEqual([{ source: "shelfdb", label: "ShelfDB Books" }]);

    await expect(store.set_book_ids("shelfdb:8", { other_ids: { shelfdb: "7" } })).rejects.toThrow("Piranesi already has that shelfdb id");
    expect((await store.set_book_ids("shelfdb:8", { other_ids: { shelfdb: "9", hardcover: "12" } })).other_ids).toEqual({ shelfdb: "9" });
    expect(store.get_book("shelfdb:8")).toMatchObject({ hardcover_id: "", overview: "Book 9 from ShelfDB." });
    expect((await store.set_book_ids("shelfdb:8", { other_ids: { shelfdb: "" } })).other_ids).toEqual({});
  });
});

// A movies and shows catalogue as one from the plugins folder would be: one film it knows TMDB's id for, one it alone knows.
const shelf_titles_plugin = define_plugin<MediaPluginApi>({
  id: "someone.shelf-titles",
  name: "ShelfDB Films",
  version: "1.0.0",
  app: app_info.id,
  start: (context) => {
    const films: Record<string, ReturnType<typeof empty_title>> = {
      "7": { ...empty_title("movie"), other_ids: { shelfdb: "7" }, tmdb_id: "693134", name: "Dune Part Two (ShelfDB)", genres: "Epic", overview: "From ShelfDB." },
      "8": { ...empty_title("movie"), other_ids: { shelfdb: "8" }, name: "A Short Film", year: "2025", poster_path: "https://shelfdb.example/8.jpg", runtime: 12 },
    };
    context.provide("title_catalog", "shelfdb", {
      source: "shelfdb",
      label: "ShelfDB Films",
      missing: "",
      client: null,
      title: async (_media_type, id) => films[id] ?? Promise.reject(new Error("no such film")),
      search: async () => Object.values(films),
    });
  },
});

// TMDB as the store asks it, with one film.
function stub_tmdb(): void {
  vi.stubGlobal("fetch", async (address: string) => {
    const path = new URL(address).pathname;
    if (path === "/3/movie/693134") return Response.json({ id: 693134, title: "Dune: Part Two", release_date: "2024-02-27", poster_path: "/dune.jpg", runtime: 166, imdb_id: "tt15239678" });
    if (path === "/3/search/multi") return Response.json({ results: [{ id: 693134, media_type: "movie", title: "Dune: Part Two" }] });
    return Response.json({ status_message: "Not found." }, { status: 404 });
  });
}

describe("a movies and shows catalogue from the plugins folder", () => {
  afterEach(() => vi.unstubAllGlobals());

  function open_with_shelf_titles() {
    stub_tmdb();
    use_folder_plugins([shelf_titles_plugin]);
    const database = new DatabaseSync(":memory:");
    open_store(database);
    const store = bind_methods(() => database, () => undefined);
    store.set_setting("plugins", { "x-media-tracker.tmdb": { settings: { api_key: "test-key" } } });
    return store;
  }

  it("is searched beside TMDB, the same film found by both joined", async () => {
    const store = open_with_shelf_titles();

    const search = await store.search_titles("dune", "all");

    expect(search.results).toEqual([
      expect.objectContaining({ name: "Dune: Part Two", tmdb_id: "693134", other_ids: { shelfdb: "7" }, sources: ["tmdb", "shelfdb"] }),
      expect.objectContaining({ name: "A Short Film", other_ids: { shelfdb: "8" }, sources: ["shelfdb"] }),
    ]);
    expect(search.labels).toEqual({ tmdb: "TMDB", shelfdb: "ShelfDB Films" });
  });

  it("adds a film by its id there, TMDB's answer winning and its own filling the rest", async () => {
    const store = open_with_shelf_titles();

    expect(await store.add_title_by_ids("movie", { other_ids: { shelfdb: "7" } })).toEqual({ id: "tmdb:693134", name: "Dune: Part Two", existed: false });
    expect(store.get_title("tmdb:693134")).toMatchObject({ other_ids: { shelfdb: "7" }, imdb_id: "tt15239678", runtime: 166, genres: "Epic" });
    expect((await store.lookup_title_sources("tmdb:693134")).answers.map((answer) => answer.label)).toEqual(["TMDB", "ShelfDB Films"]);
  });

  it("tracks a film only it knows by its id there, with its own poster and no cast to look up", async () => {
    const store = open_with_shelf_titles();

    expect(await store.add_title_by_ids("movie", { other_ids: { shelfdb: "8" } })).toEqual({ id: "shelfdb:8", name: "A Short Film", existed: false });
    expect(store.get_title("shelfdb:8")).toMatchObject({ poster_path: "https://shelfdb.example/8.jpg", runtime: 12 });
    expect(await store.lookup_title_details("shelfdb:8")).toMatchObject({ name: "A Short Film", cast: [], seasons: [] });
    expect((await store.add_title_by_ids("movie", { other_ids: { shelfdb: "8" } })).existed).toBe(true);
    await expect(store.add_title_by_ids("movie", { other_ids: { nowhere: "1" } })).rejects.toThrow("No catalogue named nowhere is on.");
  });

  it("refreshes a film only it knows from it, keeping its id", async () => {
    const store = open_with_shelf_titles();
    await store.add_title_by_ids("movie", { other_ids: { shelfdb: "8" } });
    store.merge_titles(["shelfdb:8"], "shelfdb:8", { runtime: 5 });

    store.refresh_library();
    let refresh = store.get_library_refresh();
    while (refresh.state === "running") {
      await new Promise((resolve) => setTimeout(resolve, 1));
      refresh = store.get_library_refresh();
    }

    expect(refresh.report).toMatchObject({ metadata_updated: 1, failed: 0 });
    expect(store.get_title("shelfdb:8")).toMatchObject({ runtime: 12, other_ids: { shelfdb: "8" } });
  });

  it("keeps every merged title's ids from it on the one kept", async () => {
    const store = open_with_shelf_titles();
    await store.add_title_by_ids("movie", { other_ids: { shelfdb: "8" } });
    await store.add_title("movie", "693134");

    const merged = store.merge_titles(["tmdb:693134", "shelfdb:8"], "tmdb:693134", {});

    expect(merged.other_ids).toEqual({ shelfdb: "8" });
    expect(store.get_title("shelfdb:8")).toBeNull();
  });

  it("takes its id typed by hand and asks it about the title, refusing one another title has", async () => {
    const store = open_with_shelf_titles();
    await store.add_title("movie", "693134");
    await store.add_title_by_ids("movie", { other_ids: { shelfdb: "8" } });
    expect(await store.list_folder_title_catalogs()).toEqual([{ source: "shelfdb", label: "ShelfDB Films" }]);

    await expect(store.set_title_ids("tmdb:693134", { other_ids: { shelfdb: "8" } })).rejects.toThrow("A Short Film already has that shelfdb id");
    expect(await store.set_title_ids("tmdb:693134", { other_ids: { shelfdb: "7", tmdb: "1" } })).toMatchObject({ other_ids: { shelfdb: "7" }, genres: "Epic", name: "Dune: Part Two" });
    expect((await store.set_title_ids("tmdb:693134", { other_ids: { shelfdb: "" } })).other_ids).toEqual({});
  });
});
