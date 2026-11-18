// The books: every book tracked, with its status, rating, review, reads, progress, journal and collections; the authors
// and series followed and the new books found for them; yearly reading goals. BookBrainz, Open Library and Hardcover
// fill in what books are, and StoryGraph's export brings a library in.

// ── Imports ──────────────────────────────────────────────────────────────────

import { shift_day, today } from "@x-tech-laboratories/x-libs/dates";
import { and, asc, desc, eq, inArray, or, synced_tables } from "@x-tech-laboratories/x-libs/drizzle";
import { in_transaction, type SqlDatabase } from "@x-tech-laboratories/x-libs/sql";

import { Background, define_feature, drizzle_of, new_id } from "../feature.ts";
import { books_api } from "./api.ts";
import { create_bookbrainz } from "./bookbrainz.ts";
import { catalog_labels, empty_book, join_results, merge_books, merge_refs, same_book, title_words, type CatalogBook, type CatalogRelease, type CatalogSeries, type CatalogSource } from "./catalog.ts";
import { create_hardcover, type Hardcover } from "./hardcover.ts";
import { migrations } from "./migrations/index.ts";
import {
  book_key,
  clean_isbn,
  follow_key,
  is_book_format,
  is_book_status,
  is_progress_unit,
  parse_book_link,
  parse_bookbrainz_id,
  parse_openlibrary_id,
  reading_stats,
  release_day,
  sort_series,
  type BookCollection,
  type BookFormat,
  type BookIds,
  type BookRead,
  type BookStatus,
  type CatalogRef,
  type Follow,
  type FollowKind,
  type JournalEntry,
  type LibraryBook,
  type ProgressUnit,
  type ReadingStats,
  type Release,
} from "./model.ts";
import { create_openlibrary } from "./openlibrary.ts";
import { books_book_collections, books_books, books_collections, books_follows, books_goals, books_journal, books_reads, books_releases, books_tables } from "./schema.ts";
import { books_secret_settings, books_setting_defaults } from "./settings.ts";
import { read_librarything_export } from "./librarything.ts";
import { read_storygraph_csv, write_goodreads_csv, type ImportedBook } from "./storygraph.ts";

// ── Shapes ───────────────────────────────────────────────────────────────────

export interface Books {
  books: LibraryBook[];
  collections: BookCollection[];
}

export interface BookSearchResult extends CatalogBook {
  // The library's book with any of the same ids, or "" when it is not tracked.
  tracked_id: string;
}

export interface BookSearch {
  results: BookSearchResult[];
  // Catalogues that failed, by name with why, such as "Hardcover: the key was refused".
  failures: string[];
}

export interface AddedBook {
  id: string;
  title: string;
  existed: boolean;
}

export interface BookImportReport {
  added: number;
  updated: number;
}

export interface ReleaseCheck {
  ran_at: string;
  // New books found in this check.
  found: number;
  // Follows whose check failed, with why.
  failures: string[];
}

export interface ReadingYear {
  stats: ReadingStats;
  // Books to finish that year, or null when no goal is set.
  goal: number | null;
}

export interface BooksRefreshReport {
  total: number;
  updated: number;
  failed: number;
}

export interface BooksRefresh {
  state: "none" | "running" | "done" | "failed";
  done: number;
  total: number;
  started_at: string;
  finished_at: string;
  report: BooksRefreshReport | null;
  error: string;
}

// ── Settings ─────────────────────────────────────────────────────────────────

type BooksSetting = keyof typeof books_setting_defaults;

export function books_setting<Key extends BooksSetting>(database: SqlDatabase, key: Key): (typeof books_setting_defaults)[Key] {
  const row = database.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row ? JSON.parse(row.value) : books_setting_defaults[key];
}

function set_books_setting(database: SqlDatabase, key: BooksSetting, value: unknown): void {
  database.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(key, JSON.stringify(value));
}

// Hardcover only when a key is set; the open catalogues always.
function catalogs_of(database: SqlDatabase) {
  const key = books_setting(database, "books.hardcover_api_key");
  return { bookbrainz: create_bookbrainz(), openlibrary: create_openlibrary(), hardcover: key.trim() ? create_hardcover(key) : null };
}

function require_hardcover(database: SqlDatabase): Hardcover {
  const hardcover = catalogs_of(database).hardcover;
  if (!hardcover) throw new Error("Set a Hardcover API key in Settings → Books first.");
  return hardcover;
}

// How far back a release check looks, so a book out last week still shows as new.
const release_lookback_days = 30;

// How many books a refresh asks the catalogues about at once.
const refresh_concurrency = 4;

const hour_in_milliseconds = 60 * 60 * 1000;

// ── Reading ──────────────────────────────────────────────────────────────────

function parse_json<Value>(text: string, fallback: Value): Value {
  try {
    return text ? (JSON.parse(text) as Value) : fallback;
  } catch {
    return fallback;
  }
}

function as_read(row: typeof books_reads.$inferSelect): BookRead {
  return { ...row, format: is_book_format(row.format) ? row.format : "", dnf: row.dnf === 1 };
}

export function list_books(database: SqlDatabase, ids?: string[]): LibraryBook[] {
  const db = drizzle_of(database);
  const rows = ids ? db.select().from(books_books).where(inArray(books_books.id, ids)).all() : db.select().from(books_books).orderBy(asc(books_books.title)).all();
  const collections_of = new Map<string, string[]>();
  for (const link of db.select().from(books_book_collections).all()) collections_of.set(link.book_id, [...(collections_of.get(link.book_id) ?? []), link.collection_id]);
  const reads_of = new Map<string, BookRead[]>();
  const read_rows = ids ? db.select().from(books_reads).where(inArray(books_reads.book_id, ids)).all() : db.select().from(books_reads).all();
  for (const read of read_rows) reads_of.set(read.book_id, [...(reads_of.get(read.book_id) ?? []), as_read(read)]);
  return rows.map((row) => {
    const reads = (reads_of.get(row.id) ?? []).sort((first, second) => (first.finished_on || first.started_on || "9999").localeCompare(second.finished_on || second.started_on || "9999"));
    return {
      ...row,
      author_refs: parse_json<CatalogRef[]>(row.author_refs, []),
      series_ref: parse_json<CatalogRef | null>(row.series_ref, null),
      status: is_book_status(row.status) ? row.status : "want_to_read",
      format: is_book_format(row.format) ? row.format : "",
      progress_unit: is_progress_unit(row.progress_unit) ? row.progress_unit : "pages",
      owned: row.owned === 1,
      collection_ids: collections_of.get(row.id) ?? [],
      reads,
      read_count: reads.filter((read) => read.finished_on && !read.dnf).length,
    };
  });
}

export function require_book(database: SqlDatabase, id: string): LibraryBook {
  const [book] = list_books(database, [id]);
  if (!book) throw new Error("That book is not in the library.");
  return book;
}

// The library's book with any of the ids given, so catalogues that know a book by different ids land on one row.
export function find_book(database: SqlDatabase, ids: Partial<BookIds>): string {
  const db = drizzle_of(database);
  const key = book_key(ids);
  if (key && db.select({ id: books_books.id }).from(books_books).where(eq(books_books.id, key)).get()) return key;
  const matches = [
    ids.bookbrainz_id ? eq(books_books.bookbrainz_id, ids.bookbrainz_id) : undefined,
    ids.openlibrary_id ? eq(books_books.openlibrary_id, ids.openlibrary_id) : undefined,
    ids.hardcover_id ? eq(books_books.hardcover_id, ids.hardcover_id) : undefined,
    ids.isbn ? eq(books_books.isbn, ids.isbn) : undefined,
  ].filter((match) => match !== undefined);
  if (matches.length === 0) return "";
  return db.select({ id: books_books.id }).from(books_books).where(or(...matches)).get()?.id ?? "";
}

// A book with no catalogue id, such as one imported from StoryGraph or LibraryThing without an ISBN, found by its title and first author.
function find_by_title(database: SqlDatabase, title: string, authors: string): string {
  const words = title_words(title);
  const author = authors.split(",")[0]!.trim().toLowerCase();
  const rows = drizzle_of(database).select({ id: books_books.id, title: books_books.title, authors: books_books.authors }).from(books_books).all();
  return rows.find((row) => title_words(row.title) === words && (!author || row.authors.toLowerCase().includes(author)))?.id ?? "";
}

function open_read(database: SqlDatabase, book_id: string): typeof books_reads.$inferSelect | undefined {
  return drizzle_of(database)
    .select()
    .from(books_reads)
    .where(and(eq(books_reads.book_id, book_id), eq(books_reads.finished_on, "")))
    .orderBy(desc(books_reads.started_on))
    .get();
}

// The day last finished follows the reads, so editing or removing one keeps it right.
function settle_last_read(database: SqlDatabase, book_id: string): void {
  const db = drizzle_of(database);
  const finished = db
    .select({ finished_on: books_reads.finished_on })
    .from(books_reads)
    .where(and(eq(books_reads.book_id, book_id), eq(books_reads.dnf, 0)))
    .all()
    .map((read) => read.finished_on)
    .filter(Boolean)
    .sort();
  db.update(books_books).set({ last_read: finished.at(-1) ?? "" }).where(eq(books_books.id, book_id)).run();
}

// ── Catalogues ───────────────────────────────────────────────────────────────

// What every catalogue that knows the book says, BookBrainz first, then Open Library, then Hardcover; each may fail
// alone, and the book is refused only when none answered.
async function gather(database: SqlDatabase, start: CatalogBook): Promise<CatalogBook> {
  const { bookbrainz, openlibrary, hardcover } = catalogs_of(database);
  let book = start;
  let answered = start.title !== "";
  const failures: string[] = [];
  const series_from: Partial<Record<CatalogSource, CatalogBook>> = {};
  const ask = async (source: CatalogSource, lookup: () => Promise<CatalogBook>) => {
    try {
      const found = await lookup();
      book = merge_books(book, found);
      if (found.series) series_from[source] = found;
      answered = true;
    } catch (error) {
      failures.push(`${catalog_labels[source]}: ${(error as Error).message}`);
    }
  };
  if (book.bookbrainz_id) await ask("bookbrainz", () => bookbrainz.work(book.bookbrainz_id));
  if (book.openlibrary_id) await ask("openlibrary", () => openlibrary.work(book.openlibrary_id));
  else if (book.isbn) await ask("openlibrary", () => openlibrary.by_isbn(book.isbn));
  // Open Library may have named the BookBrainz work.
  if (book.bookbrainz_id && !start.bookbrainz_id) await ask("bookbrainz", () => bookbrainz.work(book.bookbrainz_id));
  if (hardcover) {
    if (book.hardcover_id) await ask("hardcover", () => hardcover.book(book.hardcover_id));
    else if (book.isbn) await ask("hardcover", () => hardcover.book_by_isbn(book.isbn));
  }
  if (!answered) throw new Error(failures.join("; ") || "No catalogue knows that book.");
  // The series comes from the catalogue that knows it best: Hardcover has each book's place, BookBrainz is curated, and
  // Open Library's comes from its subjects.
  const best = series_from.hardcover ?? series_from.bookbrainz;
  return best ? { ...book, series: best.series, series_position: best.series_position } : book;
}

function metadata_of(book: CatalogBook) {
  return {
    bookbrainz_id: book.bookbrainz_id,
    openlibrary_id: book.openlibrary_id,
    hardcover_id: book.hardcover_id,
    isbn: book.isbn,
    title: book.title,
    subtitle: book.subtitle,
    authors: book.authors.map((author) => author.name).join(", "),
    author_refs: JSON.stringify(book.authors),
    series: book.series?.name ?? "",
    series_position: book.series_position,
    series_ref: book.series ? JSON.stringify(book.series) : "",
    year: book.year,
    release_date: book.release_date,
    overview: book.overview,
    cover_url: book.cover_url,
    genres: book.genres,
    pages: book.pages,
    audio_minutes: book.audio_minutes,
  };
}

// A book already tracked keeps its status, rating, reads and notes; only what the catalogues say of it changes, and a
// value they no longer give is kept.
function write_details(database: SqlDatabase, book: CatalogBook): AddedBook {
  const db = drizzle_of(database);
  const fields = metadata_of(book);
  const existing = find_book(database, book);
  if (existing) {
    const row = db.select().from(books_books).where(eq(books_books.id, existing)).get()!;
    const kept = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value === "" || value === 0 || value === "[]" ? row[key as keyof typeof row] : value]));
    db.update(books_books).set(kept).where(eq(books_books.id, existing)).run();
    return { id: existing, title: book.title, existed: true };
  }
  const id = book_key(book);
  if (!id) throw new Error("That book has no BookBrainz, Open Library or Hardcover id or ISBN.");
  const status = books_setting(database, "books.default_status");
  db.insert(books_books)
    .values({ id, ...fields, status: is_book_status(status) ? status : "want_to_read", added_at: today() })
    .run();
  return { id, title: book.title, existed: false };
}

// An Open Library work's id, or the work of the edition given, such as OL7353617M.
async function openlibrary_work_of(input: string): Promise<string> {
  const parsed = parse_openlibrary_id(input);
  if (!parsed) throw new Error(`${input} is not an Open Library work or edition, such as OL5738148W or OL7353617M.`);
  return parsed.kind === "work" ? parsed.id : create_openlibrary().edition_work(parsed.id);
}

async function add_from(database: SqlDatabase, source: CatalogSource | "isbn", id: string): Promise<AddedBook> {
  const start = empty_book(source === "isbn" ? "openlibrary" : source);
  if (source === "bookbrainz") start.bookbrainz_id = id;
  else if (source === "openlibrary") start.openlibrary_id = await openlibrary_work_of(id);
  else if (source === "hardcover") start.hardcover_id = id;
  else {
    start.isbn = clean_isbn(id);
    if (!start.isbn) throw new Error(`${id} is not an ISBN.`);
  }
  return write_details(database, await gather(database, start));
}

// Every catalogue searched at once; one failing leaves the others' answers.
async function search_everywhere(database: SqlDatabase, query: string): Promise<BookSearch> {
  const { bookbrainz, openlibrary, hardcover } = catalogs_of(database);
  const searches: [CatalogSource, Promise<CatalogBook[]>][] = [
    ["openlibrary", openlibrary.search(query)],
    ...(hardcover ? [["hardcover", hardcover.search(query)] as [CatalogSource, Promise<CatalogBook[]>]] : []),
    ["bookbrainz", bookbrainz.search(query)],
  ];
  const settled = await Promise.allSettled(searches.map(([, search]) => search));
  const failures = settled.flatMap((result, index) => (result.status === "rejected" ? [`${catalog_labels[searches[index]![0]]}: ${(result.reason as Error).message}`] : []));
  if (failures.length === searches.length) throw new Error(failures.join("; "));
  const lists = settled.map((result) => (result.status === "fulfilled" ? result.value : []));
  const results = join_results(lists).map((book) => ({ ...book, tracked_id: find_book(database, book) || find_by_title(database, book.title, book.authors.map((author) => author.name).join(", ")) }));
  return { results, failures };
}

// An author or series as every catalogue names it, matched on the exact name, so one follow covers them all.
async function resolve_ref(database: SqlDatabase, kind: FollowKind, ref: CatalogRef): Promise<CatalogRef> {
  const { bookbrainz, openlibrary, hardcover } = catalogs_of(database);
  const same_name = (found: CatalogRef[]) => found.find((each) => each.name.toLowerCase() === ref.name.toLowerCase());
  let resolved = { ...ref };
  const lookups: Promise<CatalogRef[]>[] = [
    !resolved.bookbrainz_id ? bookbrainz.search_refs(ref.name, kind) : Promise.resolve([]),
    kind === "author" && !resolved.openlibrary_id ? openlibrary.search_authors(ref.name) : Promise.resolve([]),
    hardcover && !resolved.hardcover_id ? hardcover.search_refs(ref.name, kind) : Promise.resolve([]),
  ];
  for (const found of await Promise.allSettled(lookups)) {
    const match = found.status === "fulfilled" ? same_name(found.value) : undefined;
    if (match) resolved = merge_refs(resolved, match);
  }
  return resolved;
}

// Search for an author or series to follow, across every catalogue, one row per name.
async function search_refs_everywhere(database: SqlDatabase, query: string, kind: FollowKind): Promise<CatalogRef[]> {
  const { bookbrainz, openlibrary, hardcover } = catalogs_of(database);
  const lookups = [bookbrainz.search_refs(query, kind), kind === "author" ? openlibrary.search_authors(query) : Promise.resolve([]), hardcover ? hardcover.search_refs(query, kind) : Promise.resolve([])];
  const joined: CatalogRef[] = [];
  for (const found of await Promise.allSettled(lookups)) {
    if (found.status !== "fulfilled") continue;
    for (const ref of found.value.filter((each) => each.name)) {
      const index = joined.findIndex((each) => each.name.toLowerCase() === ref.name.toLowerCase());
      if (index >= 0) joined[index] = merge_refs(joined[index]!, ref);
      else joined.push(ref);
    }
  }
  return joined;
}

// ── Series ───────────────────────────────────────────────────────────────────

// Hardcover knows each book's place; BookBrainz only which works; otherwise the library's own books in that series.
async function series_of(database: SqlDatabase, book: LibraryBook): Promise<CatalogSeries | null> {
  const ref = book.series_ref;
  if (!book.series && !ref) return null;
  const hardcover = catalogs_of(database).hardcover;
  if (hardcover && ref?.hardcover_id) {
    const found = await hardcover.series(ref.hardcover_id).catch(() => null);
    if (found) return found;
  }
  if (ref?.bookbrainz_id) {
    const found = await create_bookbrainz().series(ref.bookbrainz_id).catch(() => null);
    if (found) return found;
  }
  const mine = list_books(database).filter((each) => each.series && each.series.toLowerCase() === book.series.toLowerCase());
  return {
    name: book.series,
    bookbrainz_id: ref?.bookbrainz_id ?? "",
    openlibrary_id: "",
    hardcover_id: ref?.hardcover_id ?? "",
    books: sort_series(mine.map((each) => ({ position: each.series_position, title: each.title, release_date: each.release_date, cover_url: each.cover_url, ids: each }))),
  };
}

// ── Releases ─────────────────────────────────────────────────────────────────

function as_follow(row: typeof books_follows.$inferSelect): Follow {
  return { ...row, kind: row.kind === "series" ? "series" : "author" };
}

function as_release(row: typeof books_releases.$inferSelect): Release {
  return { ...row, seen: row.seen === 1 };
}

async function releases_for(database: SqlDatabase, follow: Follow, since: string): Promise<CatalogRelease[]> {
  const { openlibrary, hardcover } = catalogs_of(database);
  const found: CatalogRelease[] = [];
  if (follow.kind === "author" && follow.openlibrary_id) found.push(...(await openlibrary.author_releases(follow.openlibrary_id, since)));
  if (hardcover && follow.hardcover_id) found.push(...(await hardcover.releases(follow.kind, follow.hardcover_id, since)));
  if (follow.kind === "series" && !(hardcover && follow.hardcover_id)) throw new Error("new books in a series are found through Hardcover; set its key in Settings → Books.");
  return found;
}

// New releases go in unseen; those found in a follow's first check need no alert, since the user is just starting to follow.
function store_releases(database: SqlDatabase, follow: Follow, found: CatalogRelease[], now: string): number {
  const db = drizzle_of(database);
  const known = db.select().from(books_releases).where(eq(books_releases.follow_id, follow.id)).all();
  const first_check = follow.checked_at === "";
  let added = 0;
  for (const release of found) {
    const id = release.hardcover_id ? `hardcover:${release.hardcover_id}` : `openlibrary:${release.openlibrary_id}`;
    const same = known.find((each) => each.id === id || title_words(each.title) === title_words(release.title));
    const release_date = release_day(release.release_date);
    if (same) {
      if (release_date && same.release_date !== release_date) db.update(books_releases).set({ release_date }).where(eq(books_releases.id, same.id)).run();
      continue;
    }
    if (db.select({ id: books_releases.id }).from(books_releases).where(eq(books_releases.id, id)).get()) continue;
    db.insert(books_releases)
      .values({ id, follow_id: follow.id, ...release, release_date, found_at: now, seen: 0, notified_at: first_check ? now : "" })
      .run();
    known.push({ id, follow_id: follow.id, ...release, release_date, found_at: now, seen: 0, notified_at: "" });
    added++;
  }
  if (first_check) db.update(books_follows).set({ checked_at: now }).where(eq(books_follows.id, follow.id)).run();
  return added;
}

async function check_releases(database: SqlDatabase): Promise<ReleaseCheck> {
  const now = new Date().toISOString();
  const since = shift_day(today(), -release_lookback_days);
  const follows = drizzle_of(database).select().from(books_follows).all().map(as_follow);
  const check: ReleaseCheck = { ran_at: now, found: 0, failures: [] };
  for (const follow of follows) {
    try {
      const found = await releases_for(database, follow, since);
      check.found += in_transaction(database, () => store_releases(database, follow, found, now));
    } catch (error) {
      check.failures.push(`${follow.name}: ${(error as Error).message}`);
    }
  }
  set_books_setting(database, "books.last_release_check", now);
  set_books_setting(database, "books.last_release_result", [`${check.found} new`, ...check.failures].join("; "));
  return check;
}

// ── Importing ────────────────────────────────────────────────────────────────

function collection_named(database: SqlDatabase, name: string): string {
  const db = drizzle_of(database);
  const found = db
    .select()
    .from(books_collections)
    .all()
    .find((collection) => collection.name.toLowerCase() === name.toLowerCase());
  if (found) return found.id;
  const id = new_id();
  db.insert(books_collections).values({ id, name }).run();
  return id;
}

// A new book whole; one already here gains its reads, collections and what it lacks, keeping its own rating unless
// the settings say otherwise, and moving on from Want to read.
function import_book(database: SqlDatabase, book: ImportedBook): "added" | "updated" {
  const db = drizzle_of(database);
  const existing = (book.isbn ? find_book(database, { isbn: book.isbn }) : "") || find_by_title(database, book.title, book.authors);
  const overwrite_rating = books_setting(database, "books.import_overwrite_ratings") === true;
  let id = existing;
  if (existing) {
    const row = db.select().from(books_books).where(eq(books_books.id, existing)).get()!;
    db.update(books_books)
      .set({
        isbn: row.isbn || book.isbn,
        status: row.status === "want_to_read" ? book.status : row.status,
        rating: overwrite_rating ? (book.rating ?? row.rating) : (row.rating ?? book.rating),
        review: row.review || book.review,
        owned: row.owned || book.owned ? 1 : 0,
        format: row.format || book.format,
        moods: row.moods || book.moods,
        pace: row.pace || book.pace,
        added_at: row.added_at || book.added_at,
      })
      .where(eq(books_books.id, existing))
      .run();
  } else {
    id = book_key({ isbn: book.isbn }) || `title:${title_words(book.title)}/${book.authors.split(",")[0]!.trim().toLowerCase()}`;
    db.insert(books_books)
      .values({
        id,
        isbn: book.isbn,
        title: book.title,
        authors: book.authors,
        author_refs: JSON.stringify(book.authors.split(",").map((name) => ({ name: name.trim(), bookbrainz_id: "", openlibrary_id: "", hardcover_id: "" })).filter((ref) => ref.name)),
        status: book.status,
        rating: book.rating,
        review: book.review,
        owned: book.owned ? 1 : 0,
        format: book.format,
        moods: book.moods,
        pace: book.pace,
        added_at: book.added_at || today(),
      })
      .run();
  }
  const known = db.select().from(books_reads).where(eq(books_reads.book_id, id)).all();
  for (const read of book.reads) {
    if (known.some((each) => each.finished_on === read.finished_on && (each.started_on === read.started_on || !read.started_on))) continue;
    db.insert(books_reads)
      .values({ id: new_id(), book_id: id, started_on: read.started_on, finished_on: read.finished_on, format: book.format, dnf: read.dnf ? 1 : 0 })
      .run();
  }
  if (book.status === "reading" && !open_read(database, id) && !book.reads.some((read) => !read.finished_on)) {
    db.insert(books_reads).values({ id: new_id(), book_id: id, started_on: "", finished_on: "", format: book.format, dnf: 0 }).run();
  }
  for (const tag of book.tags) db.insert(books_book_collections).values({ book_id: id, collection_id: collection_named(database, tag) }).onConflictDoNothing().run();
  settle_last_read(database, id);
  return existing ? "updated" : "added";
}

// ── Ids ──────────────────────────────────────────────────────────────────────

const id_labels: Record<keyof BookIds, string> = { bookbrainz_id: "BookBrainz id", openlibrary_id: "Open Library id", hardcover_id: "Hardcover id", isbn: "ISBN" };

const work_example = "797946a0-32b3-43fb-b58d-cd12343a9c07";

// Each id typed or pasted as its catalogue writes it; empty clears it.
async function clean_ids(ids: Partial<BookIds>): Promise<Partial<BookIds>> {
  const cleaned: Partial<BookIds> = {};
  const refuse = (key: keyof BookIds, example: string) => new Error(`${ids[key]} is not a ${id_labels[key]}, such as ${example}.`);
  if (ids.bookbrainz_id !== undefined) {
    cleaned.bookbrainz_id = parse_bookbrainz_id(ids.bookbrainz_id);
    if (ids.bookbrainz_id.trim() && !cleaned.bookbrainz_id) throw refuse("bookbrainz_id", work_example);
  }
  if (ids.openlibrary_id !== undefined) cleaned.openlibrary_id = ids.openlibrary_id.trim() ? await openlibrary_work_of(ids.openlibrary_id) : "";
  if (ids.hardcover_id !== undefined) {
    cleaned.hardcover_id = ids.hardcover_id.trim();
    if (cleaned.hardcover_id && !/^\d+$/.test(cleaned.hardcover_id)) throw refuse("hardcover_id", "427514");
  }
  if (ids.isbn !== undefined) {
    cleaned.isbn = clean_isbn(ids.isbn);
    if (ids.isbn.trim() && !cleaned.isbn) throw refuse("isbn", "9780765311788");
  }
  return cleaned;
}

// The book keeps its own id and everything about it; only the catalogue ids change, and then its details are fetched again.
async function set_ids(database: SqlDatabase, id: string, ids: Partial<BookIds>): Promise<LibraryBook> {
  require_book(database, id);
  const cleaned = await clean_ids(ids);
  const db = drizzle_of(database);
  in_transaction(database, () => {
    for (const [key, value] of Object.entries(cleaned) as [keyof BookIds, string][]) {
      if (!value) continue;
      const other = db.select({ id: books_books.id, title: books_books.title }).from(books_books).where(eq(books_books[key], value)).all().find((row) => row.id !== id);
      if (other) throw new Error(`${other.title} already has that ${id_labels[key]}; remove one of the two books first.`);
    }
    db.update(books_books).set(cleaned).where(eq(books_books.id, id)).run();
  });
  await refresh_book(database, require_book(database, id)).catch(() => false);
  return require_book(database, id);
}

// ── Refreshing ───────────────────────────────────────────────────────────────

const no_refresh: BooksRefresh = { state: "none", done: 0, total: 0, started_at: "", finished_at: "", report: null, error: "" };
const refreshes = new WeakMap<SqlDatabase, BooksRefresh>();
const running_work = new WeakMap<SqlDatabase, Promise<void>>();

function snapshot_of(refresh: BooksRefresh): BooksRefresh {
  return { ...refresh, report: refresh.report && { ...refresh.report } };
}

// A book known only by its title, such as one imported without an ISBN, is first looked for on Open Library.
async function refresh_book(database: SqlDatabase, book: LibraryBook): Promise<boolean> {
  let start: CatalogBook = { ...empty_book("openlibrary"), bookbrainz_id: book.bookbrainz_id, openlibrary_id: book.openlibrary_id, hardcover_id: book.hardcover_id, isbn: book.isbn };
  if (!book_key(start)) {
    const candidate: CatalogBook = { ...empty_book("openlibrary"), title: book.title, authors: book.author_refs };
    const match = (await create_openlibrary().search(`${book.title} ${book.authors.split(",")[0] ?? ""}`)).find((found) => same_book(found, candidate));
    if (!match) return false;
    start = match;
  }
  const details = await gather(database, start);
  const db = drizzle_of(database);
  const row = db.select().from(books_books).where(eq(books_books.id, book.id)).get();
  if (!row) return false;
  const fields = metadata_of(details);
  const kept = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value === "" || value === 0 || value === "[]" ? row[key as keyof typeof row] : value]));
  db.update(books_books).set(kept).where(eq(books_books.id, book.id)).run();
  return true;
}

async function run_refresh(database: SqlDatabase, refresh: BooksRefresh): Promise<void> {
  try {
    const books = list_books(database);
    const report: BooksRefreshReport = { total: books.length, updated: 0, failed: 0 };
    refresh.total = books.length;
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < books.length) {
        const book = books[next++]!;
        const updated = await refresh_book(database, book).catch(() => false);
        if (updated) report.updated++;
        else report.failed++;
        refresh.done++;
      }
    };
    await Promise.all(Array.from({ length: refresh_concurrency }, worker));
    Object.assign(refresh, { state: "done", report });
  } catch (error) {
    Object.assign(refresh, { state: "failed", error: (error as Error).message });
  }
  refresh.finished_at = new Date().toISOString();
}

// ── Feature ──────────────────────────────────────────────────────────────────

function require_status(status: BookStatus): void {
  if (!is_book_status(status)) throw new Error(`Unknown status: ${String(status)}.`);
}

function require_day(day: string, what: string): void {
  if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`${what} is a day such as 2026-11-10, or empty.`);
}

export const books_feature = define_feature({
  id: "books",
  migrations: migrations.map((migration) => migration.statements),
  tables: synced_tables(books_tables),
  setting_defaults: books_setting_defaults,
  secret_settings: books_secret_settings,
  methods: {
    list_books: (database: SqlDatabase): Books => ({
      books: list_books(database),
      collections: drizzle_of(database).select().from(books_collections).orderBy(asc(books_collections.name)).all(),
    }),

    get_book: (database: SqlDatabase, id: string): LibraryBook | null => list_books(database, [id])[0] ?? null,

    search_books: (database: SqlDatabase, query: string): Promise<BookSearch> => search_everywhere(database, query),

    lookup_book_series: async (database: SqlDatabase, id: string): Promise<CatalogSeries | null> => series_of(database, require_book(database, id)),

    list_book_journal: (database: SqlDatabase, book_id: string): JournalEntry[] =>
      drizzle_of(database)
        .select()
        .from(books_journal)
        .where(eq(books_journal.book_id, book_id))
        .orderBy(desc(books_journal.written_on))
        .all(),

    add_book: async (database: SqlDatabase, source: CatalogSource | "isbn", id: string): Promise<AddedBook> => add_from(database, source, id.trim()),

    add_book_from_link: async (database: SqlDatabase, link: string): Promise<AddedBook> => {
      const parsed = parse_book_link(link);
      if (!parsed) throw new Error("Not a BookBrainz, Open Library or Hardcover link or an ISBN, such as https://openlibrary.org/works/OL5738148W or 9780765311788.");
      if (parsed.source === "isbn") return add_from(database, "isbn", parsed.isbn);
      if (parsed.source === "hardcover") return write_details(database, await gather(database, await require_hardcover(database).book_by_slug(parsed.slug)));
      return add_from(database, parsed.source, parsed.id);
    },

    set_book_ids: (database: SqlDatabase, id: string, ids: Partial<BookIds>): Promise<LibraryBook> => set_ids(database, id, ids),

    remove_book: (database: SqlDatabase, id: string): void => {
      require_book(database, id);
      drizzle_of(database).delete(books_books).where(eq(books_books.id, id)).run();
    },

    // Reading opens a read from today; Read and Did not finish close the open one today, or add one that ends today.
    set_book_status: (database: SqlDatabase, id: string, status: BookStatus): void => {
      require_status(status);
      const book = require_book(database, id);
      in_transaction(database, () => {
        const db = drizzle_of(database);
        const open = open_read(database, id);
        const day = today();
        if (status === "reading" && !open) db.insert(books_reads).values({ id: new_id(), book_id: id, started_on: day, finished_on: "", format: book.format, dnf: 0 }).run();
        if (status === "read" || status === "dnf") {
          const dnf = status === "dnf" ? 1 : 0;
          if (open) db.update(books_reads).set({ finished_on: day, dnf }).where(eq(books_reads.id, open.id)).run();
          else db.insert(books_reads).values({ id: new_id(), book_id: id, started_on: "", finished_on: day, format: book.format, dnf }).run();
        }
        db.update(books_books)
          .set(status === "read" ? { status, progress: 0 } : { status })
          .where(eq(books_books.id, id))
          .run();
        settle_last_read(database, id);
      });
    },

    set_book_rating: (database: SqlDatabase, id: string, rating: number | null): void => {
      if (rating !== null && !(Number.isFinite(rating) && rating >= 0 && rating <= 10)) throw new Error("A rating is 1 to 10, or none.");
      require_book(database, id);
      drizzle_of(database)
        .update(books_books)
        .set({ rating: rating ? Math.round(rating) : null })
        .where(eq(books_books.id, id))
        .run();
    },

    set_book_review: (database: SqlDatabase, id: string, review: string): void => {
      require_book(database, id);
      drizzle_of(database).update(books_books).set({ review: review.trim() }).where(eq(books_books.id, id)).run();
    },

    set_book_owned: (database: SqlDatabase, id: string, owned: boolean): void => {
      require_book(database, id);
      drizzle_of(database)
        .update(books_books)
        .set({ owned: owned ? 1 : 0 })
        .where(eq(books_books.id, id))
        .run();
    },

    set_book_format: (database: SqlDatabase, id: string, format: BookFormat): void => {
      if (!is_book_format(format)) throw new Error(`Unknown format: ${String(format)}.`);
      require_book(database, id);
      drizzle_of(database).update(books_books).set({ format }).where(eq(books_books.id, id)).run();
    },

    // Progress on a book not yet started starts it.
    set_book_progress: (database: SqlDatabase, id: string, progress: number, unit: ProgressUnit): LibraryBook => {
      if (!is_progress_unit(unit)) throw new Error(`Unknown unit: ${String(unit)}.`);
      if (!(Number.isFinite(progress) && progress >= 0)) throw new Error("Progress is a number from 0 up.");
      if (unit === "percent" && progress > 100) throw new Error("Progress in percent is 0 to 100.");
      const book = require_book(database, id);
      in_transaction(database, () => {
        const db = drizzle_of(database);
        const starts = progress > 0 && (book.status === "want_to_read" || book.status === "paused");
        if (starts && !open_read(database, id)) db.insert(books_reads).values({ id: new_id(), book_id: id, started_on: today(), finished_on: "", format: book.format, dnf: 0 }).run();
        db.update(books_books)
          .set({ progress, progress_unit: unit, ...(starts ? { status: "reading" } : {}) })
          .where(eq(books_books.id, id))
          .run();
      });
      return require_book(database, id);
    },

    save_book_read: (database: SqlDatabase, book_id: string, read: { id?: string; started_on: string; finished_on: string; format: BookFormat; dnf: boolean }): string => {
      require_book(database, book_id);
      require_day(read.started_on, "The start");
      require_day(read.finished_on, "The finish");
      if (read.started_on && read.finished_on && read.finished_on < read.started_on) throw new Error("A read finishes on or after the day it started.");
      const format = is_book_format(read.format) ? read.format : "";
      return in_transaction(database, () => {
        const db = drizzle_of(database);
        const fields = { started_on: read.started_on, finished_on: read.finished_on, format, dnf: read.dnf ? 1 : 0 };
        const id = read.id || new_id();
        if (read.id) db.update(books_reads).set(fields).where(and(eq(books_reads.id, read.id), eq(books_reads.book_id, book_id))).run();
        else db.insert(books_reads).values({ id, book_id, ...fields }).run();
        settle_last_read(database, book_id);
        return id;
      });
    },

    remove_book_read: (database: SqlDatabase, id: string): void => {
      const db = drizzle_of(database);
      const read = db.select().from(books_reads).where(eq(books_reads.id, id)).get();
      if (!read) throw new Error("There is no such read.");
      in_transaction(database, () => {
        db.delete(books_reads).where(eq(books_reads.id, id)).run();
        settle_last_read(database, read.book_id);
      });
    },

    save_journal_entry: (database: SqlDatabase, book_id: string, entry: { id?: string; written_on: string; page: number | null; text: string }): string => {
      require_book(database, book_id);
      const text = entry.text.trim();
      if (!text) throw new Error("A journal entry needs some text.");
      const written_on = entry.written_on || today();
      require_day(written_on, "The day");
      const page = entry.page !== null && Number.isFinite(entry.page) && entry.page > 0 ? Math.round(entry.page) : null;
      const db = drizzle_of(database);
      if (entry.id) {
        db.update(books_journal).set({ written_on, page, text }).where(and(eq(books_journal.id, entry.id), eq(books_journal.book_id, book_id))).run();
        return entry.id;
      }
      const id = new_id();
      db.insert(books_journal).values({ id, book_id, written_on, page, text }).run();
      return id;
    },

    remove_journal_entry: (database: SqlDatabase, id: string): void => void drizzle_of(database).delete(books_journal).where(eq(books_journal.id, id)).run(),

    set_book_collections: (database: SqlDatabase, id: string, collection_ids: string[]): void => {
      require_book(database, id);
      in_transaction(database, () => {
        const db = drizzle_of(database);
        db.delete(books_book_collections).where(eq(books_book_collections.book_id, id)).run();
        for (const collection_id of new Set(collection_ids)) db.insert(books_book_collections).values({ book_id: id, collection_id }).run();
      });
    },

    // Adds a collection or renames one; a name already in use, whatever its case, merges the two.
    save_book_collection: (database: SqlDatabase, collection: { id?: string; name: string }): string => {
      const name = collection.name.trim();
      if (!name) throw new Error("A collection needs a name.");
      return in_transaction(database, () => {
        const db = drizzle_of(database);
        const same_name = db
          .select()
          .from(books_collections)
          .all()
          .find((other) => other.name.toLowerCase() === name.toLowerCase() && other.id !== collection.id);
        if (!collection.id) return same_name?.id ?? collection_named(database, name);
        if (same_name) {
          const books = db.select({ book_id: books_book_collections.book_id }).from(books_book_collections).where(eq(books_book_collections.collection_id, collection.id)).all();
          for (const { book_id } of books) db.insert(books_book_collections).values({ book_id, collection_id: same_name.id }).onConflictDoNothing().run();
          db.delete(books_collections).where(eq(books_collections.id, collection.id)).run();
          return same_name.id;
        }
        db.update(books_collections).set({ name }).where(eq(books_collections.id, collection.id)).run();
        return collection.id;
      });
    },

    // Its books stay; they only lose the collection.
    remove_book_collection: (database: SqlDatabase, id: string): void => void drizzle_of(database).delete(books_collections).where(eq(books_collections.id, id)).run(),

    search_book_people: (database: SqlDatabase, query: string, kind: FollowKind): Promise<CatalogRef[]> => search_refs_everywhere(database, query, kind === "series" ? "series" : "author"),

    list_follows: (database: SqlDatabase): Follow[] => drizzle_of(database).select().from(books_follows).orderBy(asc(books_follows.kind), asc(books_follows.name)).all().map(as_follow),

    // The author or series is looked up by name in the other catalogues too, so one follow finds books in all of them.
    follow_book_people: async (database: SqlDatabase, kind: FollowKind, ref: CatalogRef): Promise<string> => {
      if (kind !== "author" && kind !== "series") throw new Error("Follow an author or a series.");
      if (!ref.name?.trim()) throw new Error("Name the author or series to follow.");
      const resolved = await resolve_ref(database, kind, { name: ref.name.trim(), bookbrainz_id: ref.bookbrainz_id ?? "", openlibrary_id: ref.openlibrary_id ?? "", hardcover_id: ref.hardcover_id ?? "" });
      const id = follow_key(kind, resolved);
      if (!id) throw new Error(`No catalogue knows ${ref.name}; try the name as BookBrainz or Open Library spells it.`);
      const db = drizzle_of(database);
      const existing = db.select().from(books_follows).where(eq(books_follows.id, id)).get();
      if (existing) db.update(books_follows).set({ name: resolved.name, bookbrainz_id: resolved.bookbrainz_id, openlibrary_id: resolved.openlibrary_id, hardcover_id: resolved.hardcover_id }).where(eq(books_follows.id, id)).run();
      else db.insert(books_follows).values({ id, kind, ...resolved, followed_at: today() }).run();
      return id;
    },

    // Its releases go with it.
    unfollow_book_people: (database: SqlDatabase, id: string): void => void drizzle_of(database).delete(books_follows).where(eq(books_follows.id, id)).run(),

    list_releases: (database: SqlDatabase): Release[] => drizzle_of(database).select().from(books_releases).orderBy(asc(books_releases.release_date)).all().map(as_release),

    // Checks every follow for new books when the hours set have passed, or now when forced; gives what it found, or null
    // when it was not due.
    run_release_check: async (database: SqlDatabase, force: boolean): Promise<ReleaseCheck | null> => {
      const hours = Math.max(1, Number(books_setting(database, "books.release_check_hours")) || books_setting_defaults["books.release_check_hours"]);
      const last = Date.parse(String(books_setting(database, "books.last_release_check")));
      if (!force && Number.isFinite(last) && Date.now() - last < hours * hour_in_milliseconds) return null;
      if (drizzle_of(database).select({ id: books_follows.id }).from(books_follows).get() === undefined) return force ? { ran_at: new Date().toISOString(), found: 0, failures: [] } : null;
      return check_releases(database);
    },

    mark_releases_seen: (database: SqlDatabase, ids: string[]): void => {
      const db = drizzle_of(database);
      if (ids.length) db.update(books_releases).set({ seen: 1 }).where(inArray(books_releases.id, ids)).run();
      else db.update(books_releases).set({ seen: 1 }).where(eq(books_releases.seen, 0)).run();
    },

    // Releases found since the last alert, for the server to send.
    list_unnotified_releases: (database: SqlDatabase): Release[] => drizzle_of(database).select().from(books_releases).where(eq(books_releases.notified_at, "")).all().map(as_release),

    mark_releases_notified: (database: SqlDatabase, ids: string[]): void => {
      if (ids.length) drizzle_of(database).update(books_releases).set({ notified_at: new Date().toISOString() }).where(inArray(books_releases.id, ids)).run();
    },

    get_reading_year: (database: SqlDatabase, year: number): ReadingYear => {
      const goal = drizzle_of(database).select().from(books_goals).where(eq(books_goals.year, String(year))).get();
      return { stats: reading_stats(list_books(database), year), goal: goal?.target ?? null };
    },

    set_reading_goal: (database: SqlDatabase, year: number, target: number | null): void => {
      if (!Number.isInteger(year) || year < 1000) throw new Error("A goal is for a year such as 2026.");
      const db = drizzle_of(database);
      if (target === null || target <= 0) db.delete(books_goals).where(eq(books_goals.year, String(year))).run();
      else db.insert(books_goals).values({ year: String(year), target: Math.round(target) }).onConflictDoUpdate({ target: books_goals.year, set: { target: Math.round(target) } }).run();
    },

    // StoryGraph's own export; adds and merges, never removes.
    import_storygraph: (database: SqlDatabase, csv: string): BookImportReport => {
      const books = read_storygraph_csv(csv);
      return in_transaction(database, () => {
        const report: BookImportReport = { added: 0, updated: 0 };
        for (const book of books) report[import_book(database, book)]++;
        return report;
      });
    },

    // LibraryThing's own export, tab-separated or CSV; adds and merges, never removes.
    import_librarything: (database: SqlDatabase, text: string): BookImportReport => {
      const books = read_librarything_export(text);
      return in_transaction(database, () => {
        const report: BookImportReport = { added: 0, updated: 0 };
        for (const book of books) report[import_book(database, book)]++;
        return report;
      });
    },

    export_storygraph: (database: SqlDatabase): string => {
      const names = new Map(drizzle_of(database).select().from(books_collections).all().map((collection) => [collection.id, collection.name]));
      return write_goodreads_csv(list_books(database), names);
    },

    // Starts fetching every book's details again in the background, or answers with the refresh already running.
    refresh_books: (database: SqlDatabase): Background<BooksRefresh> => {
      const running = refreshes.get(database);
      if (running?.state === "running") return new Background(snapshot_of(running), running_work.get(database)!);
      const refresh: BooksRefresh = { ...no_refresh, state: "running", started_at: new Date().toISOString() };
      refreshes.set(database, refresh);
      const work = run_refresh(database, refresh);
      running_work.set(database, work);
      return new Background(snapshot_of(refresh), work);
    },

    get_books_refresh: (database: SqlDatabase): BooksRefresh => snapshot_of(refreshes.get(database) ?? no_refresh),
  },
  api: books_api,
});
