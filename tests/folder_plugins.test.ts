import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { define_plugin } from "@x-tech-laboratories/x-libs/plugins";
import { hash_password } from "@x-tech-laboratories/x-libs/server/passwords";
import { afterEach, describe, expect, it } from "vitest";

import { read_plugin_file } from "../src/main/plugin_files.ts";
import { build_app } from "../src/server/app.ts";
import { empty_book } from "../src/shared/books/catalog.ts";
import { book_catalog_manifests } from "../src/shared/books/manifests.ts";
import { empty_game } from "../src/shared/games/catalog.ts";
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
});
