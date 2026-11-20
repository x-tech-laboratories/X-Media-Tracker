// @vitest-environment jsdom
import "@x-tech-laboratories/x-libs/web/react/test_stubs";
import { DatabaseSync } from "node:sqlite";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Client } from "@x-tech-laboratories/x-libs/electron/bridge";
import { Dialogs } from "@x-tech-laboratories/x-libs/web/react/dialog";
import { zip_text_files } from "@x-tech-laboratories/x-libs/zip";

import { bind_methods, open_store, type MediaMethods } from "../src/shared/store.ts";
import { set_page_api } from "../src/web/api.ts";
import { SettingsView } from "../src/web/settings/SettingsView.tsx";
import { forget_page_plugins } from "../src/web/sources/plugins.tsx";
import { transfer_input } from "../src/web/transfer.tsx";
import { seed_library } from "./library_sample.ts";

// ── Page ─────────────────────────────────────────────────────────────────────

// The page's calls answered by a real store on a throwaway database.
function fake_page() {
  const database = new DatabaseSync(":memory:");
  open_store(database);
  const methods = bind_methods(() => database, () => undefined);
  const calls = Object.fromEntries(Object.entries(methods).map(([name, call]) => [name, async (...args: unknown[]) => (call as (...args: unknown[]) => unknown)(...args)]));
  set_page_api({ host: "desktop", calls: calls as unknown as Client<MediaMethods>, device: null, cover_src: async () => "", on_change: () => () => undefined });
  return { methods, database };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  forget_page_plugins();
  vi.unstubAllGlobals();
});

// ── Files ────────────────────────────────────────────────────────────────────

describe("picked files", () => {
  it("reads one JSON export, a CSV zip, or CSV files picked together", async () => {
    expect(await transfer_input([new File(['{"app":"x-media-tracker"}'], "movies.json")])).toEqual({ json: '{"app":"x-media-tracker"}' });

    const zip = zip_text_files({ "titles.csv": "id\r\n", "read me.txt": "left out" });
    expect(await transfer_input([new File([zip as Uint8Array<ArrayBuffer>], "movies.zip")])).toEqual({ csv: { "titles.csv": "id\r\n" } });
    expect(await transfer_input([new File(["id\r\n"], "titles.csv"), new File(["title_id\r\n"], "episodes.csv")])).toEqual({ csv: { "titles.csv": "id\r\n", "episodes.csv": "title_id\r\n" } });
    await expect(transfer_input([new File(["{}"], "a.json"), new File([""], "titles.csv")])).rejects.toThrow("Pick a JSON export on its own.");
  });
});

// ── Settling ─────────────────────────────────────────────────────────────────

describe("importing in Settings", () => {
  it("opens the merge window for a title the file rates otherwise and saves the file's rating", async () => {
    const { methods, database } = fake_page();
    seed_library(database);
    const file = methods.export_library_json();
    file.tables.titles = file.tables.titles!.map((title) => (title.id === "tmdb:693134" ? { ...title, rating: 7 } : title));
    render(
      <>
        <SettingsView />
        <Dialogs />
      </>,
    );

    fireEvent.change(await screen.findByLabelText("movies export file"), { target: { files: [new File([JSON.stringify(file)], "movies.json")] } });

    expect(await screen.findByText("Settle Dune: Part Two from the file (1 of 1)")).toBeTruthy();
    expect(screen.getAllByText("From the file").length).toBeGreaterThan(0);
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(methods.get_title("tmdb:693134")!.rating).toBe(7));
  });

  it("leaves a title as it was when its conflict is skipped", async () => {
    const { methods, database } = fake_page();
    seed_library(database);
    const file = methods.export_library_json();
    file.tables.titles = file.tables.titles!.map((title) => ({ ...title, notes: `Notes on ${String(title.name)}`, rating: 5 }));
    database.exec("UPDATE library_titles SET notes = 'Mine'");
    render(
      <>
        <SettingsView />
        <Dialogs />
      </>,
    );

    fireEvent.change(await screen.findByLabelText("movies export file"), { target: { files: [new File([JSON.stringify(file)], "movies.json")] } });
    expect(await screen.findByText(/from the file \(1 of 3\)/)).toBeTruthy();
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Skip" }));
    expect(await screen.findByText(/from the file \(2 of 3\)/)).toBeTruthy();
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Skip the rest" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(methods.list_library().titles.map((title) => title.notes)).toEqual(["Mine", "Mine", "Mine"]);
  });
});
