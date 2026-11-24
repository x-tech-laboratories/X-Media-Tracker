// What a tracked book is, and the rules on it that need no database: which ids name the same book, pasted links, reading
// progress, sorting, the Books library's filters with counts, series order and a year's reading stats.
// The page imports this file too, so it imports only other_ids.ts, which imports nothing.

import { clean_other_ids, other_key, shares_an_other_id, type OtherIds } from "../other_ids.ts";

export { clean_other_ids, type OtherIds };

// ── Books ────────────────────────────────────────────────────────────────────

export const book_statuses = ["want_to_read", "reading", "paused", "read", "dnf"] as const;

export type BookStatus = (typeof book_statuses)[number];

export const book_status_labels: Record<BookStatus, string> = { want_to_read: "Want to read", reading: "Reading", paused: "Paused", read: "Read", dnf: "Did not finish" };

export const book_formats = ["", "print", "ebook", "audiobook"] as const;

export type BookFormat = (typeof book_formats)[number];

export const book_format_labels: Record<BookFormat, string> = { "": "Any format", print: "Print", ebook: "Ebook", audiobook: "Audiobook" };

export const progress_units = ["pages", "percent", "minutes"] as const;

export type ProgressUnit = (typeof progress_units)[number];

export interface BookIds {
  bookbrainz_id: string;
  openlibrary_id: string;
  hardcover_id: string;
  isbn: string;
}

// An author or series as each catalogue names it, so it can be followed.
export interface CatalogRef {
  name: string;
  bookbrainz_id: string;
  openlibrary_id: string;
  hardcover_id: string;
}

export interface Book extends BookIds {
  id: string;
  // Ids from catalogues with no column of their own, such as one from the plugins folder.
  other_ids: OtherIds;
  title: string;
  subtitle: string;
  // The authors as one line, such as "Brandon Sanderson, Dan Wells".
  authors: string;
  author_refs: CatalogRef[];
  series: string;
  // Its place in the series as written, such as "2" or "2.5"; "" when not known.
  series_position: string;
  series_ref: CatalogRef | null;
  year: string;
  // The first release, such as 2026-11-10, or "".
  release_date: string;
  overview: string;
  cover_url: string;
  // The full image kept on every device, by its synced file's name, and the address it was taken from ("custom" when set by hand).
  cover_file: string;
  cover_file_from: string;
  // Subjects as one line, such as "Fantasy, Magic".
  genres: string;
  pages: number;
  audio_minutes: number;
  status: BookStatus;
  // 1 to 10, shown as half stars out of five; null when unrated.
  rating: number | null;
  review: string;
  // Your own notes, in Markdown.
  notes: string;
  owned: boolean;
  format: BookFormat;
  // How far into the current read, in progress_unit.
  progress: number;
  progress_unit: ProgressUnit;
  // StoryGraph's moods and pace, kept as it gave them.
  moods: string;
  pace: string;
  // The day last finished, such as 2026-07-20, or "".
  last_read: string;
  added_at: string;
}

// One time through a book, with its own days; a book read twice has two.
export interface BookRead {
  id: string;
  book_id: string;
  started_on: string;
  finished_on: string;
  format: BookFormat;
  dnf: boolean;
}

export interface JournalEntry {
  id: string;
  book_id: string;
  written_on: string;
  // The page the note is about, or null.
  page: number | null;
  text: string;
}

// A book as the Books library lists it: with its collections and every read.
export interface LibraryBook extends Book {
  collection_ids: string[];
  reads: BookRead[];
  read_count: number;
}

export interface BookCollection {
  id: string;
  name: string;
}

export function is_book_status(value: unknown): value is BookStatus {
  return typeof value === "string" && (book_statuses as readonly string[]).includes(value);
}

export function is_book_format(value: unknown): value is BookFormat {
  return typeof value === "string" && (book_formats as readonly string[]).includes(value);
}

export function is_progress_unit(value: unknown): value is ProgressUnit {
  return typeof value === "string" && (progress_units as readonly string[]).includes(value);
}

// ── Ids ──────────────────────────────────────────────────────────────────────

// The strongest id first: BookBrainz is open and stable, Open Library holds covers, Hardcover needs a key, an ISBN names
// an edition, and last another catalogue's, the first by its source's name.
export function book_key(ids: Partial<BookIds> & { other_ids?: OtherIds }): string {
  if (ids.bookbrainz_id) return `bookbrainz:${ids.bookbrainz_id}`;
  if (ids.openlibrary_id) return `openlibrary:${ids.openlibrary_id}`;
  if (ids.hardcover_id) return `hardcover:${ids.hardcover_id}`;
  if (ids.isbn) return `isbn:${ids.isbn}`;
  return other_key(ids.other_ids);
}

export function shares_a_book_id(first: Partial<BookIds> & { other_ids?: OtherIds }, second: Partial<BookIds> & { other_ids?: OtherIds }): boolean {
  const same = (one: string | undefined, other: string | undefined) => !!one && one === (other ?? "");
  return (
    same(first.bookbrainz_id, second.bookbrainz_id) || same(first.openlibrary_id, second.openlibrary_id) || same(first.hardcover_id, second.hardcover_id) || same(first.isbn, second.isbn) || shares_an_other_id(first.other_ids, second.other_ids)
  );
}

// A follow's id from its strongest catalogue id, so following one author on two devices makes one row.
export function follow_key(kind: FollowKind, ref: Partial<CatalogRef>): string {
  if (ref.bookbrainz_id) return `${kind}:bookbrainz:${ref.bookbrainz_id}`;
  if (ref.openlibrary_id) return `${kind}:openlibrary:${ref.openlibrary_id}`;
  if (ref.hardcover_id) return `${kind}:hardcover:${ref.hardcover_id}`;
  return "";
}

// Digits only, with an ISBN-10's final X kept; anything else is not an ISBN.
export function clean_isbn(value: string): string {
  const cleaned = value.replace(/[^0-9Xx]/g, "").toUpperCase();
  return /^(\d{13}|\d{9}[\dX])$/.test(cleaned) ? cleaned : "";
}

// An Open Library work or edition as typed or pasted, such as OL5738148W, OL7353617M or a link to either.
export function parse_openlibrary_id(input: string): { kind: "work" | "edition"; id: string } | null {
  const found = /\b(OL\d+)([WM])\b/i.exec(input.trim());
  if (!found) return null;
  const letter = found[2]!.toUpperCase();
  return { kind: letter === "W" ? "work" : "edition", id: `${found[1]!.toUpperCase()}${letter}` };
}

// A BookBrainz work's id, alone or in a link.
export function parse_bookbrainz_id(input: string): string {
  return /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(input)?.[0].toLowerCase() ?? "";
}

// ── Links ────────────────────────────────────────────────────────────────────

export type ParsedBookLink = { source: "bookbrainz"; id: string } | { source: "openlibrary"; id: string } | { source: "hardcover"; slug: string } | { source: "isbn"; isbn: string };

// A pasted BookBrainz, Open Library or Hardcover link, or a bare ISBN.
export function parse_book_link(input: string): ParsedBookLink | null {
  const text = input.trim();
  if (!text) return null;
  const bookbrainz = /bookbrainz\.org\/work\/([0-9a-f-]{36})/i.exec(text);
  if (bookbrainz) return { source: "bookbrainz", id: bookbrainz[1]!.toLowerCase() };
  const openlibrary = /openlibrary\.org\/works\/(OL\d+W)/i.exec(text);
  if (openlibrary) return { source: "openlibrary", id: openlibrary[1]!.toUpperCase() };
  const hardcover = /hardcover\.app\/books\/([a-z0-9-]+)/i.exec(text);
  if (hardcover) return { source: "hardcover", slug: hardcover[1]!.toLowerCase() };
  const isbn = /^[\d\s-]+[\dXx]$/.test(text) ? clean_isbn(text) : "";
  return isbn ? { source: "isbn", isbn } : null;
}

export function book_links(book: Pick<Book, "bookbrainz_id" | "openlibrary_id" | "hardcover_id">): { label: string; href: string }[] {
  return [
    book.bookbrainz_id && { label: "BookBrainz", href: `https://bookbrainz.org/work/${book.bookbrainz_id}` },
    book.openlibrary_id && { label: "Open Library", href: `https://openlibrary.org/works/${book.openlibrary_id}` },
    book.hardcover_id && { label: "Hardcover", href: `https://hardcover.app/id/book/${book.hardcover_id}` },
  ].filter((link): link is { label: string; href: string } => !!link);
}

// ── Progress ─────────────────────────────────────────────────────────────────

// How far through as a share from 0 to 1, or null when the book's length in that unit is not known.
export function progress_share(book: Pick<Book, "progress" | "progress_unit" | "pages" | "audio_minutes">): number | null {
  const whole = book.progress_unit === "percent" ? 100 : book.progress_unit === "pages" ? book.pages : book.audio_minutes;
  if (!whole) return null;
  return Math.max(0, Math.min(1, book.progress / whole));
}

export function progress_text(book: Pick<Book, "progress" | "progress_unit" | "pages" | "audio_minutes">): string {
  if (!book.progress) return "";
  if (book.progress_unit === "percent") return `${Math.round(book.progress)}%`;
  if (book.progress_unit === "pages") return book.pages ? `p. ${book.progress} of ${book.pages}` : `p. ${book.progress}`;
  return book.audio_minutes ? `${format_minutes(book.progress)} of ${format_minutes(book.audio_minutes)}` : format_minutes(book.progress);
}

export function format_minutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${String(Math.round(minutes % 60)).padStart(2, "0")}m` : `${Math.round(minutes)}m`;
}

// ── Series ───────────────────────────────────────────────────────────────────

// A series position as a number to sort by, such as 2.5 for "2.5"; unknown positions sort last.
export function position_number(position: string): number {
  const number = Number.parseFloat(position);
  return Number.isFinite(number) ? number : Number.POSITIVE_INFINITY;
}

export interface SeriesEntry {
  position: string;
  title: string;
  release_date: string;
  cover_url: string;
  ids: Partial<BookIds>;
}

// By position, then by release, then by title.
export function sort_series<Entry extends SeriesEntry>(entries: Entry[]): Entry[] {
  return [...entries].sort((first, second) => position_number(first.position) - position_number(second.position) || (first.release_date || "9999").localeCompare(second.release_date || "9999") || first.title.localeCompare(second.title));
}

// ── Sorting ──────────────────────────────────────────────────────────────────

export const book_sort_keys = ["title", "authors", "last_read", "year", "rating", "added_at", "progress"] as const;

export type BookSortKey = (typeof book_sort_keys)[number];

export const book_sort_labels: Record<BookSortKey, string> = {
  title: "A-Z",
  authors: "Author",
  last_read: "Recently read",
  year: "Release date",
  rating: "Rating",
  added_at: "Recently added",
  progress: "Progress",
};

function sort_value(book: LibraryBook, key: BookSortKey): string | number | null {
  if (key === "progress") return progress_share(book);
  const value = book[key];
  return value === "" ? null : value;
}

// A book missing the value sorts last either way; ties fall back to the title.
export function sort_books<Item extends LibraryBook>(books: Item[], key: BookSortKey, descending: boolean): Item[] {
  const direction = descending ? -1 : 1;
  return [...books].sort((first, second) => {
    const first_value = sort_value(first, key);
    const second_value = sort_value(second, key);
    if (first_value === null || second_value === null) {
      if (first_value !== second_value) return first_value === null ? 1 : -1;
      return first.title.localeCompare(second.title);
    }
    const result = typeof first_value === "number" && typeof second_value === "number" ? first_value - second_value : String(first_value).localeCompare(String(second_value));
    return result !== 0 ? result * direction : first.title.localeCompare(second.title);
  });
}

// ── Filters ──────────────────────────────────────────────────────────────────

// "all" lets everything through; a collection of "none" is books in no collection.
export interface BookFilters {
  search: string;
  status: "all" | BookStatus;
  format: "all" | BookFormat;
  owned: "all" | "owned" | "not_owned";
  collection: string;
}

export const no_book_filters: BookFilters = { search: "", status: "all", format: "all", owned: "all", collection: "all" };

type BookFacet = keyof BookFilters;

function matches_search(book: LibraryBook, search: string): boolean {
  const words = search.toLowerCase();
  return book.title.toLowerCase().includes(words) || book.authors.toLowerCase().includes(words) || book.series.toLowerCase().includes(words) || book.isbn === search.trim();
}

function passes(book: LibraryBook, filters: BookFilters, skip: BookFacet | null): boolean {
  if (skip !== "search" && filters.search && !matches_search(book, filters.search)) return false;
  if (skip !== "status" && filters.status !== "all" && book.status !== filters.status) return false;
  if (skip !== "format" && filters.format !== "all" && book.format !== filters.format) return false;
  if (skip !== "owned" && filters.owned !== "all" && book.owned !== (filters.owned === "owned")) return false;
  if (skip !== "collection" && filters.collection !== "all") {
    if (filters.collection === "none" ? book.collection_ids.length > 0 : !book.collection_ids.includes(filters.collection)) return false;
  }
  return true;
}

export function filter_books(books: LibraryBook[], filters: BookFilters): LibraryBook[] {
  return books.filter((book) => passes(book, filters, null));
}

export type BookFacetCounts = Record<Exclude<BookFacet, "search">, Record<string, number>>;

// Each choice's count of the books it would show: narrowed by every other filter but never by its own.
export function book_facet_counts(books: LibraryBook[], filters: BookFilters): BookFacetCounts {
  const counts: BookFacetCounts = { status: {}, format: {}, owned: {}, collection: {} };
  const bump = (into: Record<string, number>, key: string) => void (into[key] = (into[key] ?? 0) + 1);
  for (const book of books) {
    if (passes(book, filters, "status")) {
      bump(counts.status, "all");
      bump(counts.status, book.status);
    }
    if (passes(book, filters, "format")) {
      bump(counts.format, "all");
      bump(counts.format, book.format);
    }
    if (passes(book, filters, "owned")) {
      bump(counts.owned, "all");
      bump(counts.owned, book.owned ? "owned" : "not_owned");
    }
    if (passes(book, filters, "collection")) {
      bump(counts.collection, "all");
      if (book.collection_ids.length === 0) bump(counts.collection, "none");
      for (const id of book.collection_ids) bump(counts.collection, id);
    }
  }
  return counts;
}

// ── Follows and releases ─────────────────────────────────────────────────────

export type FollowKind = "author" | "series";

export interface Follow extends CatalogRef {
  id: string;
  kind: FollowKind;
  followed_at: string;
  checked_at: string;
}

// A book announced or released by an author or series followed.
export interface Release {
  id: string;
  follow_id: string;
  title: string;
  authors: string;
  series: string;
  series_position: string;
  release_date: string;
  cover_url: string;
  openlibrary_id: string;
  hardcover_id: string;
  found_at: string;
  // Whether it has been looked at since it was found.
  seen: boolean;
  // When an alert went out for it, or "".
  notified_at: string;
}

// Releases from today on, soonest first, then the rest of those already out, newest first.
export function order_releases<Item extends Pick<Release, "release_date" | "title">>(releases: Item[], today: string): { upcoming: Item[]; out: Item[] } {
  const upcoming = releases.filter((release) => release.release_date >= today).sort((first, second) => first.release_date.localeCompare(second.release_date) || first.title.localeCompare(second.title));
  const out = releases.filter((release) => release.release_date < today).sort((first, second) => second.release_date.localeCompare(first.release_date) || first.title.localeCompare(second.title));
  return { upcoming, out };
}

// A release date, which catalogues give as a whole day, a month or a year, as the earliest day it could mean.
export function release_day(value: string): string {
  const text = value.trim();
  const iso = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(text);
  if (iso) return `${iso[1]}-${iso[2] ?? "01"}-${iso[3] ?? "01"}`;
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return "";
  const date = new Date(parsed);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// ── Goals and stats ──────────────────────────────────────────────────────────

export interface ReadingStats {
  year: number;
  // Books finished that year, a book read twice counted twice.
  finished: number;
  pages: number;
  audio_minutes: number;
  // By month, January first.
  books_by_month: number[];
  pages_by_month: number[];
  // Ratings 1 to 10 given to the books finished, by rating.
  ratings: Record<number, number>;
  average_rating: number | null;
  formats: Record<string, number>;
  // The most common genres among the books finished, with counts, most first.
  genres: [genre: string, count: number][];
  // Books given up that year.
  dnf: number;
}

const top_genres_shown = 8;

// Each finished read counts in the month it finished; a read with no format takes the book's.
export function reading_stats(books: LibraryBook[], year: number): ReadingStats {
  const stats: ReadingStats = { year, finished: 0, pages: 0, audio_minutes: 0, books_by_month: Array(12).fill(0), pages_by_month: Array(12).fill(0), ratings: {}, average_rating: null, formats: {}, genres: [], dnf: 0 };
  const genres = new Map<string, [string, number]>();
  let rating_total = 0;
  let rated = 0;
  for (const book of books) {
    for (const read of book.reads) {
      if (!read.finished_on.startsWith(`${year}-`)) continue;
      if (read.dnf) {
        stats.dnf++;
        continue;
      }
      const month = Number(read.finished_on.slice(5, 7)) - 1;
      const format = read.format || book.format || "unknown";
      stats.finished++;
      stats.books_by_month[month]!++;
      if (format === "audiobook") stats.audio_minutes += book.audio_minutes;
      else {
        stats.pages += book.pages;
        stats.pages_by_month[month]! += book.pages;
      }
      stats.formats[format] = (stats.formats[format] ?? 0) + 1;
      if (book.rating) {
        stats.ratings[book.rating] = (stats.ratings[book.rating] ?? 0) + 1;
        rating_total += book.rating;
        rated++;
      }
      for (const genre of book.genres.split(",").map((each) => each.trim()).filter(Boolean)) {
        const known = genres.get(genre.toLowerCase());
        genres.set(genre.toLowerCase(), [known?.[0] ?? genre, (known?.[1] ?? 0) + 1]);
      }
    }
  }
  stats.average_rating = rated ? rating_total / rated : null;
  stats.genres = [...genres.values()].sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0])).slice(0, top_genres_shown);
  return stats;
}

// How many books a goal wants by now if read at an even pace, for "ahead" or "behind".
export function goal_pace(target: number, year: number, today: string): number {
  if (!today.startsWith(`${year}-`)) return today < `${year}-` ? 0 : target;
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  const now = Date.UTC(year, Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)));
  return Math.floor((target * (now - start)) / (end - start));
}
