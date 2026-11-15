import { DatabaseSync } from "node:sqlite";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bind_methods, open_store } from "../src/shared/store.ts";

// ── Catalogue stand-ins ──────────────────────────────────────────────────────

const work_id = "797946a0-32b3-43fb-b58d-cd12343a9c07";
const author_id = "272a2e3c-159a-4469-a62a-b8fabb0380e4";

// Answers by host and path; Open Library's search answers by its query instead.
let answers: Record<string, unknown> = {};

function base_answers(): Record<string, unknown> {
  return {
    [`api.bookbrainz.org/1/work/${work_id}`]: { bbid: work_id, defaultAlias: { name: "Mistborn: The Final Empire" } },
    [`api.bookbrainz.org/1/work/${work_id}/relationships`]: {
      relationships: [{ relationshipTypeName: "Writer", direction: "backward", targetBbid: author_id, targetEntityType: "author" }],
    },
    [`api.bookbrainz.org/1/work/${work_id}/identifiers`]: { identifiers: [{ type: "OpenLibrary Work ID", value: "OL5738148W" }] },
    [`api.bookbrainz.org/1/author/${author_id}`]: { defaultAlias: { name: "Brandon Sanderson" } },
    "api.bookbrainz.org/1/search": { searchResult: [{ bbid: work_id, defaultAlias: { name: "Mistborn: The Final Empire" } }] },
    "openlibrary.org/works/OL5738148W.json": {
      title: "The Final Empire",
      description: { value: "Ash falls from the sky." },
      covers: [14658160],
      subjects: ["series:Mistborn", "form:novel", "Fantasy", "Magic"],
      authors: [{ author: { key: "/authors/OL1394865A" } }],
      identifiers: { bookbrainz: [work_id] },
    },
    "openlibrary.org/authors/OL1394865A.json": { name: "Brandon Sanderson" },
    "openlibrary.org/search.json?key": { docs: [{ first_publish_year: 2006, number_of_pages_median: 541, isbn: ["0765311788", "9780765311788"], publish_date: ["July 25, 2006", "2008"] }] },
    "openlibrary.org/search.json?q": {
      docs: [{ key: "/works/OL5738148W", title: "The Final Empire", author_name: ["Brandon Sanderson"], author_key: ["OL1394865A"], first_publish_year: 2006, cover_i: 14658160 }],
    },
    "openlibrary.org/search.json?author_key": {
      docs: [
        { key: "/works/OL1W", title: "Old Book", publish_date: ["2001"], first_publish_year: 2001 },
        { key: "/works/OL2W", title: "Ghostbloods", publish_date: ["2027-03-01"], first_publish_year: 2027 },
      ],
    },
    "openlibrary.org/search/authors.json": { docs: [{ key: "OL1394865A", name: "Brandon Sanderson" }] },
  };
}

const fetch_stub = vi.fn(async (address: string) => {
  const url = new URL(address);
  const path = `${url.host}${url.pathname}`;
  const by_query = url.pathname === "/search.json" ? (url.searchParams.has("author_key") ? "author_key" : url.searchParams.get("q")?.startsWith("key:") ? "key" : "q") : "";
  const answer = answers[by_query ? `${path}?${by_query}` : path];
  if (answer) return new Response(JSON.stringify(answer), { status: 200 });
  return new Response("{}", { status: 404 });
});

beforeEach(() => {
  answers = base_answers();
  fetch_stub.mockClear();
  vi.stubGlobal("fetch", fetch_stub);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 15, 12, 0));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function open_methods() {
  const database = new DatabaseSync(":memory:");
  open_store(database);
  return bind_methods(() => database, () => undefined);
}

const storygraph_csv = [
  "Title,Authors,Contributors,ISBN/UID,Format,Read Status,Date Added,Last Date Read,Dates Read,Read Count,Moods,Pace,Star Rating,Review,Content Warnings,Tags,Owned?",
  'The Final Empire,Brandon Sanderson,,9780765311788,paperback,read,2023/01/02,2024/02/09,"2023/01/05-2023/01/20, 2024/02/01-2024/02/09",2,adventurous,fast,4.25,Loved it,,"Cosmere, Favourites",Yes',
  "Piranesi,Susanna Clarke,,,digital,currently-reading,2026/10/01,,,0,mysterious,slow,,,,,No",
].join("\n");

// ── Adding ───────────────────────────────────────────────────────────────────

describe("adding books", () => {
  it("adds a BookBrainz work with Open Library's cover, description and ISBN, keyed by its BookBrainz id", async () => {
    const store = open_methods();

    const added = await store.add_book("bookbrainz", work_id);

    expect(added).toEqual({ id: `bookbrainz:${work_id}`, title: "Mistborn: The Final Empire", existed: false });
    const book = store.get_book(added.id)!;
    expect(book).toMatchObject({
      openlibrary_id: "OL5738148W",
      isbn: "9780765311788",
      authors: "Brandon Sanderson",
      overview: "Ash falls from the sky.",
      cover_url: "https://covers.openlibrary.org/b/id/14658160-L.jpg",
      genres: "Fantasy, Magic",
      series: "Mistborn",
      pages: 541,
      year: "2006",
      release_date: "2006-07-25",
      status: "want_to_read",
    });
    expect(book.author_refs[0]).toMatchObject({ name: "Brandon Sanderson", bookbrainz_id: author_id, openlibrary_id: "OL1394865A" });
  });

  it("finds the same book again from Open Library's id and only refreshes it", async () => {
    const store = open_methods();
    await store.add_book("bookbrainz", work_id);
    await store.set_book_rating(`bookbrainz:${work_id}`, 9);

    const again = await store.add_book_from_link("https://openlibrary.org/works/OL5738148W/The_Final_Empire");

    expect(again).toMatchObject({ id: `bookbrainz:${work_id}`, existed: true });
    expect(store.list_books().books).toHaveLength(1);
    expect(store.get_book(again.id)!.rating).toBe(9);
  });

  it("joins one book from several catalogues into one search result and marks it tracked", async () => {
    const store = open_methods();
    await store.add_book("openlibrary", "OL5738148W");

    const search = await store.search_books("final empire");

    expect(search.failures).toEqual([]);
    expect(search.results).toHaveLength(1);
    expect(search.results[0]).toMatchObject({ sources: ["openlibrary", "bookbrainz"], openlibrary_id: "OL5738148W", bookbrainz_id: work_id, tracked_id: `bookbrainz:${work_id}` });
  });

  it("refuses a link it cannot read", async () => {
    const store = open_methods();
    await expect(store.add_book_from_link("https://example.org/book")).rejects.toThrow("Not a BookBrainz, Open Library or Hardcover link");
  });
});

// ── Reading ──────────────────────────────────────────────────────────────────

describe("reading a book", () => {
  it("opens a read when reading starts and closes it when finished, setting the day last read", async () => {
    const store = open_methods();
    const { id } = await store.add_book("openlibrary", "OL5738148W");

    store.set_book_status(id, "reading");
    store.set_book_status(id, "read");

    const book = store.get_book(id)!;
    expect(book.reads).toEqual([expect.objectContaining({ started_on: "2026-11-15", finished_on: "2026-11-15", dnf: false })]);
    expect(book).toMatchObject({ status: "read", last_read: "2026-11-15", read_count: 1 });
  });

  it("starts a book when progress is set on it, and keeps a re-read as a second read", async () => {
    const store = open_methods();
    const { id } = await store.add_book("openlibrary", "OL5738148W");
    store.save_book_read(id, { started_on: "2024-01-01", finished_on: "2024-01-20", format: "print", dnf: false });

    const book = store.set_book_progress(id, 120, "pages");

    expect(book).toMatchObject({ status: "reading", progress: 120, progress_unit: "pages", last_read: "2024-01-20" });
    expect(book.reads.map((read) => [read.started_on, read.finished_on])).toEqual([
      ["2024-01-01", "2024-01-20"],
      ["2026-11-15", ""],
    ]);
  });

  it("keeps a journal of dated notes, newest first", async () => {
    const store = open_methods();
    const { id } = await store.add_book("openlibrary", "OL5738148W");

    store.save_journal_entry(id, { written_on: "2026-11-01", page: 40, text: "Vin meets Kelsier." });
    store.save_journal_entry(id, { written_on: "", page: null, text: "The Lord Ruler!" });

    expect(store.list_book_journal(id).map((entry) => [entry.written_on, entry.page, entry.text])).toEqual([
      ["2026-11-15", null, "The Lord Ruler!"],
      ["2026-11-01", 40, "Vin meets Kelsier."],
    ]);
  });

  it("counts a year's finished reads against its goal", async () => {
    const store = open_methods();
    const { id } = await store.add_book("openlibrary", "OL5738148W");
    store.save_book_read(id, { started_on: "2026-02-01", finished_on: "2026-02-10", format: "", dnf: false });
    store.save_book_read(id, { started_on: "2026-05-01", finished_on: "2026-05-03", format: "audiobook", dnf: false });
    store.set_reading_goal(2026, 24);

    const year = store.get_reading_year(2026);

    expect(year.goal).toBe(24);
    expect(year.stats).toMatchObject({ finished: 2, pages: 541 });
    expect(year.stats.books_by_month.slice(0, 5)).toEqual([0, 1, 0, 0, 1]);
  });
});

// ── StoryGraph ───────────────────────────────────────────────────────────────

describe("StoryGraph", () => {
  it("imports its export with reads, rating, tags as collections and owned, merging a book already here by ISBN", async () => {
    const store = open_methods();
    const { id } = await store.add_book("openlibrary", "OL5738148W");

    const report = store.import_storygraph(storygraph_csv);

    expect(report).toEqual({ added: 1, updated: 1 });
    const { books, collections } = store.list_books();
    const empire = books.find((book) => book.id === id)!;
    expect(empire).toMatchObject({ status: "read", rating: 9, review: "Loved it", owned: true, format: "print", moods: "adventurous", last_read: "2024-02-09", read_count: 2 });
    expect(collections.map((collection) => collection.name)).toEqual(["Cosmere", "Favourites"]);
    expect(empire.collection_ids).toHaveLength(2);
    const piranesi = books.find((book) => book.title === "Piranesi")!;
    expect(piranesi).toMatchObject({ id: "title:piranesi/susanna clarke", status: "reading", format: "ebook", owned: false });
  });

  it("imports the same file twice without doubling reads", async () => {
    const store = open_methods();
    store.import_storygraph(storygraph_csv);

    store.import_storygraph(storygraph_csv);

    expect(store.list_books().books.find((book) => book.title === "The Final Empire")!.reads).toHaveLength(2);
  });

  it("exports a Goodreads library CSV that StoryGraph reads back", async () => {
    const store = open_methods();
    store.import_storygraph(storygraph_csv);

    const csv = store.export_storygraph();

    const [header, ...rows] = csv.split("\r\n");
    const empire = rows.find((row) => row.includes("The Final Empire"));
    expect(header).toContain("Title,Author,Author l-f,Additional Authors,ISBN,ISBN13,My Rating");
    expect(empire).toContain('The Final Empire,Brandon Sanderson,"Sanderson, Brandon",,,"=""9780765311788""",5');
    expect(empire).toContain("2024/02/09,2023/01/02");
  });
});

// ── Following ────────────────────────────────────────────────────────────────

describe("following authors", () => {
  it("finds an author's coming books; those in the first check need no alert, later ones do", async () => {
    const store = open_methods();
    const follow_id = await store.follow_book_people("author", { name: "Brandon Sanderson", bookbrainz_id: "", openlibrary_id: "", hardcover_id: "" });
    expect(follow_id).toBe("author:openlibrary:OL1394865A");

    const first = await store.run_release_check(true);

    expect(first).toMatchObject({ found: 1, failures: [] });
    expect(store.list_releases().map((release) => [release.title, release.release_date, release.seen])).toEqual([["Ghostbloods", "2027-03-01", false]]);
    expect(store.list_unnotified_releases()).toEqual([]);

    answers["openlibrary.org/search.json?author_key"] = { docs: [{ key: "/works/OL3W", title: "Elantris 2", publish_date: ["2028-01-01"] }] };
    const second = await store.run_release_check(true);

    expect(second).toMatchObject({ found: 1 });
    expect(store.list_unnotified_releases().map((release) => release.title)).toEqual(["Elantris 2"]);
    expect(await store.run_release_check(false)).toBeNull();
  });

  it("says a series needs Hardcover to be checked", async () => {
    const store = open_methods();
    answers["api.bookbrainz.org/1/search"] = { searchResult: [{ bbid: "23848eda-8fdc-4248-9964-8d51b848b581", defaultAlias: { name: "Mistborn" } }] };
    await store.follow_book_people("series", { name: "Mistborn", bookbrainz_id: "", openlibrary_id: "", hardcover_id: "" });

    const check = await store.run_release_check(true);

    expect(check!.failures).toEqual(["Mistborn: new books in a series are found through Hardcover; set its key in Settings → Books."]);
  });
});

// ── History ──────────────────────────────────────────────────────────────────

describe("history", () => {
  it("brings back a removed book with its reads and journal", async () => {
    const store = open_methods();
    const { id } = await store.add_book("openlibrary", "OL5738148W");
    store.set_book_status(id, "read");
    store.save_journal_entry(id, { written_on: "2026-11-15", page: null, text: "Done." });

    store.remove_book(id);
    const removed = store.list_recent_changes(10).find((change) => change.kind === "book" && change.change === "deleted")!;
    const earlier = store.list_item_history("book", id).find((version) => version.change !== "deleted")!;
    expect(removed).toBeDefined();
    store.restore_item_version("book", earlier.id);

    expect(store.get_book(id)!.reads).toHaveLength(1);
    expect(store.list_book_journal(id)).toHaveLength(1);
  });
});

// ── Refreshing ───────────────────────────────────────────────────────────────

describe("refreshing", () => {
  it("fills in an imported book's details from its ISBN and keeps its authors' ids", async () => {
    const store = open_methods();
    store.import_storygraph(storygraph_csv);
    answers["openlibrary.org/isbn/9780765311788.json"] = { works: [{ key: "/works/OL5738148W" }] };
    // No series, so the stored one is kept as it is written.
    (answers["openlibrary.org/works/OL5738148W.json"] as { subjects: string[] }).subjects = ["Fantasy"];

    store.refresh_books();
    await vi.waitFor(() => expect(store.get_books_refresh().state).toBe("done"));

    expect(store.get_books_refresh().report).toMatchObject({ total: 2, updated: 1 });
    const empire = store.list_books().books.find((book) => book.isbn === "9780765311788")!;
    expect(empire).toMatchObject({ openlibrary_id: "OL5738148W", bookbrainz_id: work_id, cover_url: "https://covers.openlibrary.org/b/id/14658160-L.jpg", rating: 9, status: "read" });
    expect(empire.author_refs[0]!.name).toBe("Brandon Sanderson");
  });
});
