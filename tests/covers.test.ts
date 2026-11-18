import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { folder_file_store } from "@x-tech-laboratories/x-libs/node_file_store";
import { hash_bytes } from "@x-tech-laboratories/x-libs/sync_files";
import { afterEach, describe, expect, it } from "vitest";

import { custom_cover, fetch_covers, referenced_covers, stale_covers } from "../src/shared/covers.ts";
import { open_store } from "../src/shared/store.ts";

let folders: string[] = [];

afterEach(() => {
  for (const folder of folders) rmSync(folder, { recursive: true, force: true });
  folders = [];
});

function setup() {
  const database = new DatabaseSync(":memory:");
  open_store(database);
  const folder = mkdtempSync(join(tmpdir(), "x-media-covers-"));
  folders.push(folder);
  const store = folder_file_store(folder);
  const asked: string[] = [];
  const images = new Map<string, string>();
  const fetcher = (async (input: string | URL) => {
    const address = String(input);
    asked.push(address);
    const image = images.get(address);
    return image === undefined ? new Response("gone", { status: 404 }) : new Response(image, { headers: { "content-type": "image/jpeg" } });
  }) as typeof fetch;
  const run = () => fetch_covers({ database: () => database, store, fetch: fetcher });
  const game = (id: string) => database.prepare("SELECT cover_url, cover_file, cover_file_from FROM games_games WHERE id = ?").get(id) as { cover_url: string; cover_file: string; cover_file_from: string };
  return { database, store, asked, images, run, game };
}

describe("kept covers", () => {
  it("downloads a game's and a book's cover once and lists them for sync", async () => {
    const { database, store, asked, images, run, game } = setup();
    images.set("https://example.org/portal.jpg", "portal art");
    images.set("https://example.org/dune.jpg", "dune art");
    database.prepare("INSERT INTO games_games (id, title, cover_url) VALUES ('rawg:portal', 'Portal', 'https://example.org/portal.jpg')").run();
    database.prepare("INSERT INTO books_books (id, title, cover_url) VALUES ('openlibrary:dune', 'Dune', 'https://example.org/dune.jpg')").run();

    expect(await run()).toBe(2);
    const name = await hash_bytes(new TextEncoder().encode("portal art"));
    expect(game("rawg:portal")).toMatchObject({ cover_file: name, cover_file_from: "https://example.org/portal.jpg" });
    expect(new TextDecoder().decode(await store.read(name))).toBe("portal art");
    expect(referenced_covers(database).sort()).toEqual([name, await hash_bytes(new TextEncoder().encode("dune art"))].sort());

    expect(await run()).toBe(0);
    expect(asked).toHaveLength(2);
  });

  it("takes the image again when the address changes, and keeps the old one when the new one fails", async () => {
    const { database, images, run, game } = setup();
    images.set("https://example.org/old.jpg", "old art");
    images.set("https://example.org/new.jpg", "new art");
    database.prepare("INSERT INTO games_games (id, title, cover_url) VALUES ('rawg:portal', 'Portal', 'https://example.org/old.jpg')").run();
    await run();

    database.prepare("UPDATE games_games SET cover_url = 'https://example.org/new.jpg'").run();
    await run();
    expect(game("rawg:portal").cover_file).toBe(await hash_bytes(new TextEncoder().encode("new art")));

    database.prepare("UPDATE games_games SET cover_url = 'https://example.org/gone.jpg'").run();
    expect(await run()).toBe(0);
    expect(game("rawg:portal")).toMatchObject({ cover_file: await hash_bytes(new TextEncoder().encode("new art")), cover_file_from: "https://example.org/new.jpg" });
  });

  it("leaves a cover set by hand alone", async () => {
    const { database, asked, run } = setup();
    database.prepare("INSERT INTO games_games (id, title, cover_url, cover_file, cover_file_from) VALUES ('title:mine/2026', 'Mine', 'https://example.org/mine.jpg', 'abc', ?)").run(custom_cover);

    expect(stale_covers(database)).toEqual([]);
    await run();
    expect(asked).toEqual([]);
  });

  it("takes a title's poster at the kept size, and again when that size changes", async () => {
    const { database, asked, images, run } = setup();
    images.set("https://image.tmdb.org/t/p/w780/arrival.jpg", "w780 poster");
    images.set("https://image.tmdb.org/t/p/original/arrival.jpg", "original poster");
    database.prepare("INSERT INTO library_titles (id, tmdb_id, media_type, name, poster_path) VALUES ('tmdb:329865', '329865', 'movie', 'Arrival', '/arrival.jpg')").run();

    await run();
    database.prepare("INSERT INTO settings (key, value) VALUES ('library.saved_poster_size', '\"original\"')").run();
    await run();

    expect(asked).toEqual(["https://image.tmdb.org/t/p/w780/arrival.jpg", "https://image.tmdb.org/t/p/original/arrival.jpg"]);
    expect(database.prepare("SELECT cover_file FROM library_titles").get()).toEqual({ cover_file: await hash_bytes(new TextEncoder().encode("original poster")) });
  });
});
