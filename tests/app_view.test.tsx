// @vitest-environment jsdom
import "@x-tech-laboratories/x-libs/web/react/test_stubs";
import { DatabaseSync } from "node:sqlite";

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Client } from "@x-tech-laboratories/x-libs/electron/bridge";

import { bind_methods, open_store, type MediaMethods } from "../src/shared/store.ts";
import { set_page_api } from "../src/web/api.ts";
import { App } from "../src/web/App.tsx";
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
  vi.useRealTimers();
});

describe("sidebar", () => {
  it("opens on the Library, lists its pages, and opens one when picked", async () => {
    fake_page();
    render(<App />);

    const tree = screen.getByRole("tree", { name: "Sections" });
    expect(await screen.findByRole("heading", { level: 1, name: "Library" })).toBeTruthy();
    expect(tree.querySelector("[data-id='library/titles']")?.getAttribute("aria-selected")).toBe("true");

    fireEvent.click(within(tree).getByText("Add", { selector: "[data-id='library/add'] *" }));
    expect(window.location.hash).toBe("#/library/add");
    go("#/library/add");
    expect(await screen.findByRole("heading", { level: 1, name: "Add" })).toBeTruthy();
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
