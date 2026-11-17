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

const storygraph_csv = [
  "Title,Authors,Contributors,ISBN/UID,Format,Read Status,Date Added,Last Date Read,Dates Read,Read Count,Moods,Pace,Star Rating,Review,Content Warnings,Tags,Owned?",
  "The Final Empire,Brandon Sanderson,,9780765311788,paperback,read,2026/01/02,2026/02/09,2026/02/01-2026/02/09,1,adventurous,fast,4.5,,,Cosmere,Yes",
  "Piranesi,Susanna Clarke,,,digital,currently-reading,2026/10/01,,,0,mysterious,slow,,,,,No",
].join("\n");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 15, 12, 0));
  window.localStorage.clear();
  window.location.hash = "";
});

afterEach(() => {
  cleanup();
  forget_page_plugins();
  vi.useRealTimers();
});

describe("books library", () => {
  it("lists the books with counts on each filter and narrows by status", async () => {
    const store = fake_page();
    store.import_storygraph(storygraph_csv);
    render(<App />);
    go("#/books/library");

    expect(await screen.findByText("2 of 2 books")).toBeTruthy();
    const status = screen.getByRole("radiogroup", { name: "Status" });
    expect(within(status).getAllByRole("radio").map((option) => option.textContent)).toEqual(["Any status (2)", "Want to read (0)", "Reading (1)", "Paused (0)", "Read (1)", "Did not finish (0)"]);

    fireEvent.click(within(status).getByRole("radio", { name: "Reading (1)" }));
    expect(await screen.findByText("1 of 2 books")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Piranesi" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "The Final Empire" })).toBeNull();
  });
});

describe("book page", () => {
  it("shows a book's reads, finishes it, and keeps a journal entry", async () => {
    const store = fake_page();
    store.import_storygraph(storygraph_csv);
    render(<App />);
    go("#/books/book/title%3Apiranesi%2Fsusanna%20clarke");

    expect(await screen.findByRole("heading", { level: 1, name: "Piranesi" })).toBeTruthy();
    const status = screen.getByRole("radiogroup", { name: "Status" });
    expect(within(status).getByRole("radio", { name: "Reading" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(within(status).getByRole("radio", { name: "Read" }));
    await waitFor(() => expect(store.get_book("title:piranesi/susanna clarke")).toMatchObject({ status: "read", last_read: "2026-11-15" }));
    expect(await screen.findByRole("heading", { name: "Reads (1)" })).toBeTruthy();

    expect(screen.getByRole("button", { name: "Follow Susanna Clarke" })).toBeTruthy();
  });

  it("changes a book's catalogue ids from a dialog", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    const store = fake_page();
    store.import_storygraph(storygraph_csv);
    render(<App />);
    go("#/books/book/title%3Apiranesi%2Fsusanna%20clarke");

    fireEvent.click(await screen.findByRole("button", { name: "Change ids" }));
    fireEvent.change(screen.getByLabelText("Hardcover"), { target: { value: "427514" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(store.get_book("title:piranesi/susanna clarke")).toMatchObject({ hardcover_id: "427514", status: "reading" }));
    vi.unstubAllGlobals();
  });
});

describe("goals", () => {
  it("sets a year's goal and shows the books finished against it", async () => {
    const store = fake_page();
    store.import_storygraph(storygraph_csv);
    render(<App />);
    go("#/books/goals");

    expect(await screen.findByRole("heading", { level: 1, name: "Reading in 2026" })).toBeTruthy();
    const goal = screen.getByLabelText("Books to finish in 2026") as HTMLInputElement;
    fireEvent.change(goal, { target: { value: "12" } });
    fireEvent.blur(goal);

    await waitFor(() => expect(store.get_reading_year(2026).goal).toBe(12));
    expect(await screen.findByText(/1 of 12 books/)).toBeTruthy();
  });
});

describe("upcoming", () => {
  it("says nothing is followed yet", async () => {
    fake_page();
    render(<App />);
    go("#/books/upcoming");

    expect(await screen.findByText("Not following anyone yet.")).toBeTruthy();
    expect(screen.getByText("Nothing announced yet.")).toBeTruthy();
  });
});

describe("books settings", () => {
  it("imports a StoryGraph export from the file picked", async () => {
    const store = fake_page();
    render(<App />);
    go("#/settings");

    const picker = (await screen.findByLabelText("StoryGraph export file")) as HTMLInputElement;
    const file = new File([storygraph_csv], "storygraph.csv", { type: "text/csv" });
    fireEvent.change(picker, { target: { files: [file] } });

    await waitFor(() => expect(store.list_books().books).toHaveLength(2));
    const section = screen.getByRole("heading", { name: "StoryGraph" }).closest("section")!;
    expect(within(section).getByRole("button", { name: "Export CSV" })).toBeTruthy();
  });
});
