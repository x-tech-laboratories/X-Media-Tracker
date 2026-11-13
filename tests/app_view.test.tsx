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
import { trilium_database, trilium_groups } from "./trilium_sample.ts";

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

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 10, 12, 0));
  window.localStorage.clear();
  window.location.hash = "";
});

afterEach(() => {
  cleanup();
  forget_page_plugins();
  vi.useRealTimers();
});

describe("sidebar", () => {
  it("opens on the Library, lists Library and History alike, and marks the one shown", async () => {
    fake_page();
    render(<App />);

    const nav = screen.getByRole("navigation", { name: "Sections" });
    expect(await screen.findByRole("heading", { level: 1, name: "Library" })).toBeTruthy();
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual(["Library", "History"]);
    expect(within(nav).getByRole("link", { name: "Library" }).getAttribute("aria-current")).toBe("page");

    go("#/history");
    expect(await screen.findByRole("heading", { level: 1, name: "History" })).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "History" }).getAttribute("aria-current")).toBe("page");
  });
});

describe("search", () => {
  it("opens the results from the top bar and shows the library's matches", async () => {
    const store = fake_page();
    store.import_trilium_media(trilium_database, "");
    render(<App />);

    const box = await screen.findByLabelText("Search your library and TMDB, or paste a link");
    fireEvent.change(box, { target: { value: "dune" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(window.location.hash).toBe("#/library/search/dune");
    go("#/library/search/dune");

    expect(await screen.findByRole("heading", { level: 1, name: "Search" })).toBeTruthy();
    const mine = screen.getByRole("heading", { name: "In your library" }).closest("section")!;
    expect(within(mine).getByRole("link", { name: "Dune: Part Two" })).toBeTruthy();
    expect(within(mine).queryByRole("link", { name: "Severance" })).toBeNull();
    expect(screen.getByRole("heading", { name: "From TMDB" })).toBeTruthy();
  });
});

describe("library page", () => {
  it("shows every title and narrows by type and collection, each choice counting what it would leave", async () => {
    const store = fake_page();
    store.import_trilium_media(trilium_database, trilium_groups);
    render(<App />);

    expect(await screen.findByText("3 of 3 titles")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Severance" })).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: "TV (2)" }));
    expect(await screen.findByText("2 of 3 titles")).toBeTruthy();
    const mood = screen.getByLabelText("Mood") as HTMLSelectElement;
    expect([...mood.options].map((option) => option.text)).toEqual(["Any mood (2)", "None (1)", "Comfort (1)"]);

    fireEvent.change(mood, { target: { value: "none" } });
    expect(await screen.findByText("1 of 3 titles")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Breaking Bad" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Severance" })).toBeNull();
  });
});

describe("library table", () => {
  it("shows the titles as table rows once Table is picked, and keeps the choice", async () => {
    const store = fake_page();
    store.import_trilium_media(trilium_database, "");
    render(<App />);

    fireEvent.click(await screen.findByRole("radio", { name: "Table" }));
    const table = await screen.findByRole("table", { name: "Titles" });
    const row = within(table).getAllByRole("row").find((each) => each.textContent?.includes("Severance"))!;
    expect(row.textContent).toContain("Watching");
    expect(row.textContent).toContain("10/19");
    expect(within(row).getByRole("link", { name: "Severance" }).getAttribute("href")).toBe("#/library/title/tmdb%3A95396");
    expect(window.localStorage.getItem("x-media-tracker-library-layout")).toContain("table");
  });
});

describe("title page", () => {
  it("shows a title's status and rating and changes its status", async () => {
    const store = fake_page();
    store.import_trilium_media(trilium_database, "");
    render(<App />);
    go("#/library/title/tmdb%3A693134");

    expect(await screen.findByRole("heading", { level: 1, name: "Dune: Part Two" })).toBeTruthy();
    const status = screen.getByLabelText("Status") as HTMLSelectElement;
    expect(status.value).toBe("watched");
    fireEvent.change(status, { target: { value: "dropped" } });
    await waitFor(() => expect(store.get_title("tmdb:693134")!.status).toBe("dropped"));
  });
});

describe("importing in settings", () => {
  it("shows a panel for each source that is on, and none for one turned off", async () => {
    const store = fake_page();
    render(<App />);
    go("#/settings");

    expect(await screen.findByRole("heading", { name: "Trakt" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Stremio" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in to Stremio" })).toHaveProperty("disabled", true);

    cleanup();
    forget_page_plugins();
    store.set_setting("plugins", { "x-media-tracker.trakt": { enabled: false } });
    render(<App />);
    go("#/settings");
    expect(await screen.findByRole("heading", { name: "Stremio" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Trakt" })).toBeNull();
  });

  it("saves the Trakt app and offers to sign in once there is a Client ID", async () => {
    const store = fake_page();
    render(<App />);
    go("#/settings");

    fireEvent.change(await screen.findByLabelText(/Client ID/), { target: { value: "client-id" } });
    fireEvent.change(screen.getByLabelText(/Client Secret/), { target: { value: "client-secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Trakt app" }));

    expect(await screen.findByRole("button", { name: "Sign in to Trakt" })).toBeTruthy();
    expect(store.get_trakt_status()).toMatchObject({ client_id: "client-id", has_client_secret: true });
  });
});

describe("history page", () => {
  it("lists the latest changes and brings a removed title back", async () => {
    const store = fake_page();
    store.import_trilium_media(trilium_database, "");
    store.remove_title("tmdb:693134");
    render(<App />);
    go("#/history");

    const row = (await screen.findAllByRole("row")).find((each) => each.textContent?.includes("Deleted"))!;
    expect(row.textContent).toContain("Dune: Part Two");
    fireEvent.click(within(row).getByRole("button", { name: "Bring back" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Bring back" }));
    await waitFor(() => expect(store.get_title("tmdb:693134")?.name).toBe("Dune: Part Two"));
  });
});
