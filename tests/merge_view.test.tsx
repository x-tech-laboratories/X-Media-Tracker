// @vitest-environment jsdom
import "@x-tech-laboratories/x-libs/web/react/test_stubs";
import { DatabaseSync } from "node:sqlite";

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Client } from "@x-tech-laboratories/x-libs/electron/bridge";
import { is_conflict, type MergeField } from "@x-tech-laboratories/x-libs/web/react/merge_grid";

import { bind_methods, open_store, type MediaMethods } from "../src/shared/store.ts";
import { set_page_api } from "../src/web/api.ts";
import { App } from "../src/web/App.tsx";
import { combine_arrays, combine_lists, fill_empty_choices, type MergeColumn } from "../src/web/merging.tsx";
import { forget_page_plugins } from "../src/web/sources/plugins.tsx";

// ── Page ─────────────────────────────────────────────────────────────────────

// The page's calls answered by a real store on a throwaway database, with the database at hand to make duplicates.
function fake_page() {
  const database = new DatabaseSync(":memory:");
  open_store(database);
  const methods = bind_methods(() => database, () => undefined);
  const calls = Object.fromEntries(Object.entries(methods).map(([name, call]) => [name, async (...args: unknown[]) => (call as (...args: unknown[]) => unknown)(...args)]));
  set_page_api({ host: "desktop", calls: calls as unknown as Client<MediaMethods>, device: null, cover_src: async () => "", on_change: () => () => undefined });
  return { methods, database };
}

function go(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

beforeEach(() => {
  // No catalogue answers, so the window works from the tracked copies alone.
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
  window.localStorage.clear();
  window.location.hash = "";
});

afterEach(() => {
  cleanup();
  forget_page_plugins();
  vi.unstubAllGlobals();
});

// ── Picking ──────────────────────────────────────────────────────────────────

describe("picking values", () => {
  it("joins lists once whatever their case", () => {
    expect(combine_lists(["Action, Puzzle", "puzzle, Co-op", ""])).toBe("Action, Puzzle, Co-op");
    expect(combine_arrays([["PC"], ["pc", "Switch"]])).toEqual(["PC", "Switch"]);
  });

  it("takes a field the preferred column leaves empty from the first column that has it, unless picked", () => {
    const columns: MergeColumn[] = [
      { key: "a", label: "A", tracked: true, values: { steam: "", title: "Portal 2" } },
      { key: "b", label: "B", tracked: true, values: { steam: "620", title: "Portal Two" } },
    ];
    const fields: MergeField<MergeColumn>[] = [
      { id: "steam", label: "Steam", value: (column) => column.values.steam },
      { id: "title", label: "Title", value: (column) => column.values.title },
    ];
    expect(fields.every((field) => is_conflict(field, columns))).toBe(true);

    expect(fill_empty_choices(fields, columns, "a", {}, true)).toEqual({ steam: { kind: "value", from: "b" } });
    expect(fill_empty_choices(fields, columns, "a", { steam: { kind: "value", from: "a" } }, true)).toEqual({ steam: { kind: "value", from: "a" } });
  });

  it("joins lists by default only when asked to", () => {
    const columns: MergeColumn[] = [
      { key: "a", label: "A", tracked: true, values: { genres: "Puzzle" } },
      { key: "b", label: "B", tracked: false, values: { genres: "puzzle video game" } },
    ];
    const fields: MergeField<MergeColumn>[] = [{ id: "genres", label: "Genres", value: (column) => column.values.genres, combine: combine_lists }];

    expect(fill_empty_choices(fields, columns, "a", {}, true)).toEqual({});
    expect(fill_empty_choices(fields, columns, "a", {}, false)).toEqual({ genres: { kind: "value", from: "a" } });
  });
});

// ── Window ───────────────────────────────────────────────────────────────────

describe("merge window", () => {
  it("merges a Steam copy of a game into the one open, taking what the open one lacks", async () => {
    const { methods, database } = fake_page();
    methods.import_trilium_games(JSON.stringify({ games: { a: { title: "Portal 2", status: "Finished" } } }), "");
    const [mine] = methods.list_games().games;
    database.prepare("INSERT INTO games_games (id, steam_app_id, title, status, playtime_minutes) VALUES ('steam:620', '620', 'Portal 2', 'backlog', 305)").run();
    render(<App />);
    go(`#/games/game/${encodeURIComponent(mine!.id)}`);

    fireEvent.click(await screen.findByRole("button", { name: "Merge…" }));
    const copies = (await screen.findByRole("heading", { name: "Other tracked copies" })).closest("section")!;
    fireEvent.click(within(copies).getByRole("button", { name: "Add to merge" }));

    const yours = await screen.findByRole("table", { name: "Your tracking of the game" });
    expect(within(yours).getByRole("button", { name: "5h 05m", pressed: true })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));

    await waitFor(() => expect(methods.list_games().games).toHaveLength(1));
    expect(methods.get_game(mine!.id)).toMatchObject({ steam_app_id: "620", playtime_minutes: 305, status: mine!.status });
  });
});
