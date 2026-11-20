// @vitest-environment jsdom
import "@x-tech-laboratories/x-libs/web/react/test_stubs";
import { DatabaseSync } from "node:sqlite";

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Client } from "@x-tech-laboratories/x-libs/electron/bridge";

import type { LauncherMethods, PageApi } from "../src/shared/page_api.ts";
import { bind_methods, open_store, type MediaMethods } from "../src/shared/store.ts";
import { set_page_api } from "../src/web/api.ts";
import { App } from "../src/web/App.tsx";
import { forget_page_plugins } from "../src/web/sources/plugins.tsx";
import { insert_games, type SampleGame } from "./games_sample.ts";

// The page's calls answered by a real store on a throwaway database, as the desktop app would, which needs no sign-in.
function fake_page(games: SampleGame[] = [], host: Partial<PageApi> = {}): MediaMethods {
  const database = new DatabaseSync(":memory:");
  open_store(database);
  insert_games(database, games);
  const methods = bind_methods(() => database, () => undefined);
  const calls = Object.fromEntries(Object.entries(methods).map(([name, call]) => [name, async (...args: unknown[]) => (call as (...args: unknown[]) => unknown)(...args)]));
  set_page_api({ host: "desktop", calls: calls as unknown as Client<MediaMethods>, device: null, cover_src: async () => "", on_change: () => () => undefined, ...host });
  return methods;
}

function go(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

const sample_games: SampleGame[] = [
  { id: "steam:620", steam_app_id: "620", title: "Portal 2", status: "finished", rating: 9, playtime_minutes: 305, last_played: "2025-06-04", added_at: "2026-07-28" },
  { id: "steam:105600", steam_app_id: "105600", title: "Terraria", status: "currently_playing", playtime_minutes: 50 },
  { id: "steam:70", steam_app_id: "70", title: "Half-Life", status: "backlog" },
];

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
  it("groups the covers under a heading per status group, in order from not yet played to done", async () => {
    fake_page(sample_games);
    render(<App />);
    go("#/games/library");
    await screen.findByText("3 of 3 games");

    fireEvent.change(screen.getByRole("combobox", { name: "Group by" }), { target: { value: "status_group" } });

    const headings = await screen.findAllByRole("heading", { level: 2 });
    expect(headings.map((heading) => heading.textContent)).toEqual(["Want to play 1", "Playing 1", "Played 1"]);
    expect(within(screen.getByRole("list", { name: "Played" })).getByRole("link", { name: "Portal 2" })).toBeTruthy();
  });

  it("lists the games with counts on each filter and narrows by status", async () => {
    fake_page(sample_games);
    render(<App />);
    go("#/games/library");

    expect(await screen.findByText("3 of 3 games")).toBeTruthy();
    const status = screen.getByRole("combobox", { name: "Status" });
    expect(within(status).getAllByRole("option").map((option) => (option.querySelector(".tree-option-name") ?? option).textContent!.replace(/\u00a0/g, ""))).toEqual([
      "Any status (3)",
      "Want to play (1)",
      "Wishlist (0)",
      "Backlog (1)",
      "Playing (1)",
      "Currently playing (1)",
      "On hold (0)",
      "Endless (0)",
      "Replaying (0)",
      "Played (1)",
      "Finished (1)",
      "Completed (0)",
      "Abandoned (0)",
    ]);

    fireEvent.change(status, { target: { value: "playing" } });
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
    const store = fake_page(sample_games);
    render(<App />);
    go("#/games/game/steam%3A105600");

    expect(await screen.findByRole("heading", { level: 1, name: "Terraria" })).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "Playtime" }) as HTMLInputElement).value).toBe("0.8");
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Status group" })).getByRole("radio", { name: "Played" }));
    await waitFor(() => expect(store.get_game("steam:105600")).toMatchObject({ status: "finished" }));
    fireEvent.click(await within(screen.getByRole("radiogroup", { name: "Status" })).findByRole("radio", { name: "Completed" }));
    await waitFor(() => expect(store.get_game("steam:105600")).toMatchObject({ status: "completed" }));
  });

  it("lists a game's DLC, which the library leaves out until asked for, and links DLC back to its game", async () => {
    const store = fake_page(sample_games);
    store.set_game_base("steam:70", "steam:620");
    render(<App />);
    go("#/games/library");
    expect(await screen.findByText("2 of 3 games")).toBeTruthy();
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Kind" })).getByRole("radio", { name: "DLC (1)" }));
    expect(await screen.findByText("1 of 3 games")).toBeTruthy();
    cleanup();

    render(<App />);
    go("#/games/game/steam%3A620");
    expect(await screen.findByRole("heading", { name: "DLC" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Half-Life" })).toBeTruthy();
    go("#/games/game/steam%3A70");
    expect(await screen.findByRole("link", { name: "Portal 2" })).toBeTruthy();
  });

  it("starts a game in the launchers turned on that know it, finding it in Lutris on the desktop", async () => {
    const launchers = { list_lutris_games: async () => [{ slug: "portal-2-steam", name: "Portal 2", service: "steam", service_id: "620" }] } as unknown as Client<LauncherMethods>;
    fake_page(sample_games, { launchers });
    render(<App />);
    go("#/games/game/steam%3A620");
    expect(((await screen.findByRole("link", { name: "Launch in Steam" })) as HTMLAnchorElement).href).toBe("steam://rungameid/620");
    expect(((await screen.findByRole("link", { name: "Launch in Lutris" })) as HTMLAnchorElement).href).toBe("lutris:rungame/portal-2-steam");
    expect(screen.queryByRole("link", { name: "Launch in Heroic" })).toBeNull();
    cleanup();

    fake_page(sample_games, { launchers }).set_setting("games.launchers", ["lutris"]);
    render(<App />);
    go("#/games/game/steam%3A620");
    expect(await screen.findByRole("link", { name: "Launch in Lutris" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Launch in Steam" })).toBeNull();
    cleanup();

    // A phone runs none of the launchers.
    fake_page(sample_games, { host: "android", launchers });
    render(<App />);
    go("#/games/game/steam%3A620");
    expect(await screen.findByRole("heading", { level: 1, name: "Portal 2" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Launch in Steam" })).toBeNull();
  });

  it("says when a game is not in the library", async () => {
    fake_page();
    render(<App />);
    go("#/games/game/steam%3A1");
    expect(await screen.findByText("That game is not in the library.")).toBeTruthy();
  });
});

describe("games settings", () => {
  it("signs in to the Epic Games Store from the code pasted and then offers to sign out", async () => {
    const store = fake_page();
    store.set_setting("games.epic_client_id", "launcher-id");
    store.set_setting("games.epic_client_secret", "launcher-secret");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ access_token: "epic-access", refresh_token: "epic-refresh", displayName: "Player One" }), { status: 200 })));
    render(<App />);
    go("#/settings");

    expect(await screen.findByText("Not signed in")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open Epic Games Store" }));
    const section = screen.getByRole("dialog", { name: "Epic Games Store" });
    expect(within(section).getByRole("link", { name: "Open sign-in page" }).getAttribute("href")).toContain("clientId%3Dlauncher-id");
    fireEvent.change(within(section).getByLabelText("Epic sign-in code"), { target: { value: "abcdef0123456789abcdef" } });
    fireEvent.click(within(section).getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(store.get_settings()["games.epic_account"]).toBe("Player One"));
    expect(await within(section).findByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(screen.getByText("Signed in as Player One")).toBeTruthy();
    vi.unstubAllGlobals();
  });
});
