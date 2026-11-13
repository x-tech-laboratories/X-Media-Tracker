import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import { prune_history } from "../src/shared/history/store.ts";
import { bind_methods, open_store, sync_engine } from "../src/shared/store.ts";
import { trilium_database } from "./trilium_sample.ts";

function open_methods() {
  const database = new DatabaseSync(":memory:");
  open_store(database);
  return { database, store: bind_methods(() => database, () => undefined) };
}

describe("history", () => {
  it("keeps a version of a title for every change, its episodes included, and brings a removed one back whole", () => {
    const { store } = open_methods();
    store.import_trilium_media(trilium_database, "");
    store.set_episodes_watched("tmdb:95396", [{ season: 2, from: 2, to: 9 }], true, 19);

    const versions = store.list_item_history("title", "tmdb:95396");
    expect(versions.map((version) => version.change)).toEqual(["edited", "created"]);
    expect(versions[0]).toMatchObject({ kind: "title", kind_label: "Title", item_name: "Severance", summary: "watching, 18 episodes watched", origin: "here" });

    store.remove_title("tmdb:95396");
    expect(store.get_title("tmdb:95396")).toBeNull();
    const removed = store.list_recent_changes(10).find((change) => change.item_id === "tmdb:95396")!;
    expect(removed.change).toBe("deleted");

    store.restore_item_version("title", removed.id);
    const back = store.get_title("tmdb:95396")!;
    expect(back.watched_episodes).toBe("s01e01-e09,s02e01-e09");
    expect(back.collection_ids).toHaveLength(2);
    expect(store.list_item_history("title", "tmdb:95396")[0]!.change).toBe("restored");
  });

  it("syncs the versions, and records a change only on the device that made it", () => {
    const phone = open_methods();
    const desktop = open_methods();
    const mood = phone.store.save_collection({ name: "Comfort", group_id: null });

    sync_engine.apply_changes(desktop.database, sync_engine.collect_unpushed_changes(phone.database).changes);
    expect(desktop.store.list_item_history("collection", mood).map((version) => [version.change, version.origin])).toEqual([["created", "elsewhere"]]);

    desktop.store.save_collection({ name: "Crime", group_id: null });
    expect(desktop.store.list_item_history("collection", mood)).toHaveLength(1);
  });

  it("prunes versions older than the days kept, keeping each item's newest", () => {
    const { database, store } = open_methods();
    const comfort = store.save_collection({ name: "Comfort", group_id: null });
    store.save_collection({ id: comfort, name: "Comfort viewing", group_id: null });
    store.set_setting("history.keep_days", 30);

    prune_history(database, Date.now() + 60 * 24 * 60 * 60 * 1000);
    expect(store.list_item_history("collection", comfort).map((version) => version.item_name)).toEqual(["Comfort viewing"]);
  });
});
