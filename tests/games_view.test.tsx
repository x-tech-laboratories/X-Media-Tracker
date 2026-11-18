// @vitest-environment jsdom
import "@x-tech-laboratories/x-libs/web/react/test_stubs";
import { DatabaseSync } from "node:sqlite";

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Client } from "@x-tech-laboratories/x-libs/electron/bridge";

import { bind_methods, open_store, type MediaMethods } from "../src/shared/store.ts";
import { set_page_api } from "../src/web/api.ts";
import { App } from "../src/web/App.tsx";
import { forget_page_plugins } from "../src/web/sources/plugins.tsx";

// The page's calls answered by a real store on a throwaway database, as the desktop app would, which needs no sign-in.
function fake_page(): MediaMethods {
  const database = new DatabaseSync(":memory:");
  open_store(database);
  const methods = bind_methods(() => database, () => undefined);
  const calls = Object.fromEntries(Object.entries(methods).map(([name, call]) => [name, async (...args: unknown[]) => (call as (...args: unknown[]) => unknown)(...args)]));
  set_page_api({ host: "desktop", calls: calls as unknown as Client<MediaMethods>, device: null, on_change: () => () => undefined });
  return methods;
}

function go(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

const trilium_database = JSON.stringify({
  games: {
    "steam:620": { steamAppId: "620", title: "Portal 2", status: "beaten", rating: 9, playtime: 305, lastPlayed: "2025-06-04", addedAt: "2026-07-28", collections: [] },
    "steam:105600": { steamAppId: "105600", title: "Terraria", status: "playing", playtime: 50, collections: [] },
    "steam:70": { steamAppId: "70", title: "Half-Life", status: "backlog", collections: [] },
  },
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 17, 12, 0));
  window.localStorage.clear();
  window.location.hash = "";
});

afterEach(() => {
  cleanup();
  forget_page_plugins();
  vi.useRealTimers();
});

describe("games library", () => {
  it("lists the games with counts on each filter and narrows by status", async () => {
    const store = fake_page();
    store.import_trilium_games(trilium_database, "");
    render(<App />);
    go("#/games/library");

    expect(await screen.findByText("3 of 3 games")).toBeTruthy();
    const status = screen.getByRole("radiogroup", { name: "Status" });
    expect(within(status).getAllByRole("radio").map((option) => option.textContent)).toEqual(["Any status (3)", "Want to play (1)", "Playing (1)", "Paused (0)", "Played (0)", "Completed (1)", "Dropped (0)"]);

    fireEvent.click(within(status).getByRole("radio", { name: "Playing (1)" }));
    expect(await screen.findByText("1 of 3 games")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Terraria" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Portal 2" })).toBeNull();
  });

  it("says how to start when there are no games", async () => {
    fake_page();
    render(<App />);
    go("#/games");
    expect(await screen.findByText("No games yet.")).toBeTruthy();
  });
});

describe("game page", () => {
  it("shows a game's playtime in hours and sets its status", async () => {
    const store = fake_page();
    store.import_trilium_games(trilium_database, "");
    render(<App />);
    go("#/games/game/steam%3A105600");

    expect(await screen.findByRole("heading", { level: 1, name: "Terraria" })).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "Playtime" }) as HTMLInputElement).value).toBe("0.8");
    const status = screen.getByRole("radiogroup", { name: "Status" });
    fireEvent.click(within(status).getByRole("radio", { name: "Completed" }));
    await waitFor(() => expect(store.get_game("steam:105600")).toMatchObject({ status: "completed" }));
  });

  it("says when a game is not in the library", async () => {
    fake_page();
    render(<App />);
    go("#/games/game/steam%3A1");
    expect(await screen.findByText("That game is not in the library.")).toBeTruthy();
  });
});
