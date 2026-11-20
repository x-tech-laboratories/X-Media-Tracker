// StoryGraph's and LibraryThing's dialogs below their plugin settings: each export file in, and the library out as the
// Goodreads file both read.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useRef, type ChangeEvent } from "react";
import { SettingRow } from "@x-tech-laboratories/x-libs/web/react/layout";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";

import { calls } from "../api.ts";
import { read_picked, save_text } from "../files.ts";
import { attempt } from "./actions.tsx";

// ── StoryGraph ───────────────────────────────────────────────────────────────

export function StoryGraphPanel() {
  const file = useRef<HTMLInputElement>(null);

  async function import_file(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const text = await read_picked(event);
    if (text === null) return;
    try {
      const report = await calls().import_storygraph(text);
      toast(`Imported ${report.added} new book(s) and merged ${report.updated} already here. Refresh in Books fills in covers and details.`, { tone: "good" });
    } catch (error) {
      toast(`Could not import: ${(error as Error).message}`, { tone: "bad" });
    }
  }

  return (
    <>
      <SettingRow label="Import from StoryGraph" hint="StoryGraph's export from its Manage Account page, a .csv file: statuses, read days, ratings, reviews, owned and tags as collections. New books are added and ones already here are merged.">
        <input ref={file} type="file" accept="text/csv,.csv" hidden aria-label="StoryGraph export file" onChange={(event) => void import_file(event)} />
        <button type="button" onClick={() => file.current?.click()}>
          Import StoryGraph…
        </button>
      </SettingRow>
      <SettingRow label="Export for StoryGraph" hint="The library as a Goodreads library export, which StoryGraph's Goodreads import (and Hardcover's) reads.">
        <button type="button" onClick={() => attempt(calls().export_storygraph().then((csv) => save_text("x-media-tracker-books.csv", csv)))}>
          Export CSV
        </button>
      </SettingRow>
    </>
  );
}

// ── LibraryThing ─────────────────────────────────────────────────────────────

export function LibraryThingPanel() {
  const file = useRef<HTMLInputElement>(null);

  async function import_file(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const text = await read_picked(event);
    if (text === null) return;
    try {
      const report = await calls().import_librarything(text);
      toast(`Imported ${report.added} new book(s) and merged ${report.updated} already here. Refresh in Books fills in covers and details.`, { tone: "good" });
    } catch (error) {
      toast(`Could not import: ${(error as Error).message}`, { tone: "bad" });
    }
  }

  return (
    <>
      <SettingRow label="Import from LibraryThing" hint="LibraryThing's export from its Import/Export page, tab-separated (.tsv) or CSV: read days, ratings, reviews, owned, status from its Currently reading, To read and Wishlist collections, and its other collections and tags as collections. New books are added and ones already here are merged.">
        <input ref={file} type="file" accept="text/tab-separated-values,text/csv,.tsv,.csv,.txt" hidden aria-label="LibraryThing export file" onChange={(event) => void import_file(event)} />
        <button type="button" onClick={() => file.current?.click()}>
          Import LibraryThing…
        </button>
      </SettingRow>
      <SettingRow label="Export for LibraryThing" hint="The library as a Goodreads library export, which LibraryThing's Goodreads import reads.">
        <button type="button" onClick={() => attempt(calls().export_storygraph().then((csv) => save_text("x-media-tracker-books.csv", csv)))}>
          Export CSV
        </button>
      </SettingRow>
    </>
  );
}
