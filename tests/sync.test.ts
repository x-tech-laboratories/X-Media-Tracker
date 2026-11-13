import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import { bind_methods, open_store, sync_engine } from "../src/shared/store.ts";
import { trilium_database } from "./trilium_sample.ts";

function open_device(): DatabaseSync {
  const database = new DatabaseSync(":memory:");
  open_store(database);
  return database;
}

// Sends one device's unpushed changes to another, as an exchange through the server does.
function push(from: DatabaseSync, to: DatabaseSync): void {
  const outgoing = sync_engine.collect_unpushed_changes(from);
  sync_engine.write_state(from, { pushed_seq: outgoing.up_to_seq });
  sync_engine.apply_changes(to, outgoing.changes);
}

describe("sync between devices", () => {
  it("carries titles, episodes and collections, and a title both devices added stays one", () => {
    const phone = open_device();
    const desktop = open_device();
    const on_phone = bind_methods(() => phone, () => undefined);
    const on_desktop = bind_methods(() => desktop, () => undefined);

    on_phone.import_trilium_media(trilium_database, "");
    on_desktop.import_trilium_media(trilium_database, "");
    on_phone.set_episodes_watched("tmdb:95396", [{ season: 2, from: 2, to: 3 }], true, 19);
    on_desktop.set_title_rating("tmdb:693134", 10);
    push(phone, desktop);
    push(desktop, phone);

    for (const store of [on_phone, on_desktop]) {
      const library = store.list_library();
      expect(library.titles.map((title) => title.id).sort()).toEqual(["imdb:tt0903747", "tmdb:693134", "tmdb:95396"]);
      expect(store.get_title("tmdb:95396")!.watched_episodes).toBe("s01e01-e09,s02e01-e03");
      expect(store.get_title("tmdb:693134")!.rating).toBe(10);
    }
  });
});
