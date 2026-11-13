import { DatabaseSync } from "node:sqlite";

import { describe, expect, it, vi } from "vitest";

import { bind_methods, is_read_only, needs_upgrade, open_store, setting_defaults } from "../src/shared/store.ts";

function open_database(): DatabaseSync {
  const database = new DatabaseSync(":memory:");
  open_store(database);
  return database;
}

describe("store", () => {
  it("records each feature's schema version and opens again without redoing a step", () => {
    const database = open_database();
    open_store(database);
    const versions = database.prepare("SELECT owner, version FROM schema_versions WHERE owner IN ('settings', 'library') ORDER BY owner").all().map((row) => ({ ...row }));
    expect(versions).toEqual([
      { owner: "library", version: 1 },
      { owner: "settings", version: 1 },
    ]);
  });

  it("tells a database that is behind on a feature's schema, but not a new or current one, so it is backed up first", () => {
    expect(needs_upgrade(new DatabaseSync(":memory:"))).toBe(false);
    const database = open_database();
    expect(needs_upgrade(database)).toBe(false);
    database.prepare("UPDATE schema_versions SET version = version - 1 WHERE owner = 'library'").run();
    expect(needs_upgrade(database)).toBe(true);
  });

  it("keeps settings as JSON and gives every one, the ones never set at their defaults", () => {
    const fresh = bind_methods(() => open_database(), () => undefined);
    expect(fresh.get_settings()).toEqual(setting_defaults);
    const database = open_database();
    const bound = bind_methods(() => database, () => undefined);
    bound.set_setting("library.poster_size", "w500");
    bound.set_setting("library.hidden_genres", ["Drama"]);
    expect(bound.get_settings()).toEqual({ ...setting_defaults, "library.poster_size": "w500", "library.hidden_genres": ["Drama"] });
  });

  it("announces writes and not reads", () => {
    const database = open_database();
    const on_change = vi.fn();
    const bound = bind_methods(() => database, on_change);
    bound.get_settings();
    bound.list_library();
    expect(on_change).not.toHaveBeenCalled();
    bound.save_collection_group({ name: "Mood" });
    expect(on_change).toHaveBeenCalledOnce();
    expect(is_read_only("search_tmdb")).toBe(true);
    expect(is_read_only("add_title")).toBe(false);
  });
});
