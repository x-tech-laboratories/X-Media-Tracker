import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { define_plugin } from "@x-tech-laboratories/x-libs/plugins";
import { hash_password } from "@x-tech-laboratories/x-libs/server/passwords";
import { afterEach, describe, expect, it } from "vitest";

import { read_plugin_file } from "../src/main/plugin_files.ts";
import { build_app } from "../src/server/app.ts";
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
