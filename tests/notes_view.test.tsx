// @vitest-environment jsdom
import "@x-tech-laboratories/x-libs/web/react/test_stubs";
import { DatabaseSync } from "node:sqlite";

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Client } from "@x-tech-laboratories/x-libs/electron/bridge";

import { bind_methods, open_store, type MediaMethods } from "../src/shared/store.ts";
import { set_page_api } from "../src/web/api.ts";
import { App } from "../src/web/App.tsx";
import { forget_page_plugins } from "../src/web/sources/plugins.tsx";
import { insert_games, type SampleGame } from "./games_sample.ts";
import { seed_library } from "./library_sample.ts";

// The page's calls answered by a real store on a throwaway database, as the desktop app would.
function fake_page(games: SampleGame[] = [], seed: (database: DatabaseSync) => void = () => undefined): MediaMethods {
  const database = new DatabaseSync(":memory:");
  open_store(database);
  insert_games(database, games);
  seed(database);
  const methods = bind_methods(() => database, () => undefined);
  const calls = Object.fromEntries(Object.entries(methods).map(([name, call]) => [name, async (...args: unknown[]) => (call as (...args: unknown[]) => unknown)(...args)]));
  set_page_api({ host: "desktop", calls: calls as unknown as Client<MediaMethods>, device: null, cover_src: async () => "", on_change: () => () => undefined });
  return methods;
}

function go(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

beforeEach(() => {
  // No catalogue answers; the pages work from what is tracked.
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
  window.localStorage.clear();
  window.location.hash = "";
});

afterEach(() => {
  cleanup();
  forget_page_plugins();
  vi.unstubAllGlobals();
});

describe("notes box", () => {
  it("shows each kind's own notes on its page", async () => {
    const store = fake_page([{ id: "title:portal 2", title: "Portal 2", status: "backlog" }], seed_library);
    const [game] = store.list_games().games;
    store.set_title_notes("tmdb:95396", "Rewatch with subtitles");
    store.set_game_notes(game!.id, "Finish the co-op campaign");
    render(<App />);

    go("#/movies/title/tmdb%3A95396");
    expect((await screen.findByRole("textbox", { name: "Notes" })).textContent).toContain("Rewatch with subtitles");

    go(`#/games/game/${encodeURIComponent(game!.id)}`);
    expect((await screen.findByText("Finish the co-op campaign")).closest("[role=textbox]")!.getAttribute("aria-label")).toBe("Notes");
  });
});
