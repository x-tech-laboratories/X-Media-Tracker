// What BookBrainz, Open Library and Hardcover say of a book, in one shape, and the rules for joining their answers about
// the same book; each catalogue's client turns its own answers into this shape.

// ── Imports ──────────────────────────────────────────────────────────────────

import { other_ids_differ, type OtherIds } from "../other_ids.ts";
import type { BookIds, CatalogRef, FollowKind, SeriesEntry } from "./model.ts";

// ── Shapes ───────────────────────────────────────────────────────────────────

export type CatalogSource = "bookbrainz" | "openlibrary" | "hardcover";

export const catalog_labels: Record<CatalogSource, string> = { bookbrainz: "BookBrainz", openlibrary: "Open Library", hardcover: "Hardcover" };

export interface CatalogBook extends BookIds {
  // The catalogues this answer came from, first the one searched.
  sources: string[];
  // Ids from catalogues with no column of their own.
  other_ids: OtherIds;
  title: string;
  subtitle: string;
  authors: CatalogRef[];
  series: CatalogRef | null;
  series_position: string;
  year: string;
  release_date: string;
  overview: string;
  cover_url: string;
  genres: string;
  pages: number;
  audio_minutes: number;
}

export interface CatalogSeries extends CatalogRef {
  books: SeriesEntry[];
}

// A book a followed author or series has coming or out, as a catalogue lists it.
export interface CatalogRelease {
  title: string;
  authors: string;
  series: string;
  series_position: string;
  release_date: string;
  cover_url: string;
  openlibrary_id: string;
  hardcover_id: string;
}

// A catalogue as its plugin provides it to the books store; what it cannot do is left out.
export interface BookCatalog {
  // A built-in catalogue's source, or another's own name for itself, which its ids are kept under in other_ids.
  source: string;
  label: string;
  // Why it cannot be asked now, such as "no key set"; "" when it can.
  missing: string;
  // A book by this catalogue's own id.
  book: (id: string) => Promise<CatalogBook>;
  by_isbn?: (isbn: string) => Promise<CatalogBook>;
  // A book by the name in its page's address, for a pasted link.
  by_slug?: (slug: string) => Promise<CatalogBook>;
  // Its own id from one typed or pasted, such as an edition's work; throws when it is none of its ids.
  own_id?: (input: string) => Promise<string>;
  search: (query: string) => Promise<CatalogBook[]>;
  // Authors or series by name; one from the plugins folder may leave it out.
  search_refs?: (query: string, kind: FollowKind) => Promise<CatalogRef[]>;
  // A series in order, by this catalogue's id for it.
  series?: (id: string) => Promise<CatalogSeries>;
  // The kinds of follow it finds new books for, and those books first out on or after the day given.
  release_kinds?: FollowKind[];
  releases?: (kind: FollowKind, id: string, since: string) => Promise<CatalogRelease[]>;
}

export function empty_book(source: string): CatalogBook {
  return { sources: [source], other_ids: {}, bookbrainz_id: "", openlibrary_id: "", hardcover_id: "", isbn: "", title: "", subtitle: "", authors: [], series: null, series_position: "", year: "", release_date: "", overview: "", cover_url: "", genres: "", pages: 0, audio_minutes: 0 };
}

export function empty_ref(name: string): CatalogRef {
  return { name, bookbrainz_id: "", openlibrary_id: "", hardcover_id: "" };
}

// ── Requests ─────────────────────────────────────────────────────────────────

export type Fetch = typeof fetch;

export type Json = Record<string, unknown>;

const timeout_in_milliseconds = 20_000;

// Every catalogue asks callers to name themselves.
export const user_agent = "X-Media-Tracker (https://github.com/x-tech-laboratories/X-Media-Tracker)";

// One JSON answer, failing in the catalogue's name and never repeating the address or its key.
export async function fetch_json(fetcher: Fetch, service: string, address: string, init: RequestInit = {}): Promise<Json> {
  let response: Response;
  try {
    response = await fetcher(address, { ...init, signal: AbortSignal.timeout(timeout_in_milliseconds) });
  } catch {
    throw new Error(`${service} could not be reached.`);
  }
  if (response.status === 404) throw new Error(`${service} has no such book.`);
  if (!response.ok) throw new Error(`${service} request failed (HTTP ${response.status})`);
  return (await response.json()) as Json;
}

export function text_of(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

export function number_of(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function list_of(value: unknown): Json[] {
  return Array.isArray(value) ? (value.filter((each) => each && typeof each === "object") as Json[]) : [];
}

// ── Joining ──────────────────────────────────────────────────────────────────

function plain_words(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/^(the|a|an) /, "");
}

// Lower case, without punctuation, a leading article or a subtitle, so "The Final Empire: Mistborn" meets "Final Empire".
export function title_words(title: string): string {
  return plain_words(title.split(/[:(]/)[0]!);
}

// The whole title, and the part after a series name, as in "Mistborn: The Final Empire".
function title_forms(title: string): string[] {
  const after = title.split(":").slice(1).join(":");
  return [plain_words(title.replace(/\(.*\)/, "")), ...(after ? [plain_words(after)] : [])].filter(Boolean);
}

function person_words(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

// Whether two answers are likely one book: a shared id, or the same title by the same first author; titles matching
// only before a colon, such as a series name, need both authors named and alike.
export function same_book(first: CatalogBook, second: CatalogBook): boolean {
  const same = (one: string, other: string) => !!one && one === other;
  if (same(first.bookbrainz_id, second.bookbrainz_id) || same(first.openlibrary_id, second.openlibrary_id) || same(first.hardcover_id, second.hardcover_id)) return true;
  if (Object.entries(first.other_ids).some(([source, id]) => second.other_ids[source] === id)) return true;
  // Two different ids from one catalogue are two books.
  if (other_ids_differ(first.other_ids, second.other_ids)) return false;
  const first_author = person_words(first.authors[0]?.name ?? "");
  const second_author = person_words(second.authors[0]?.name ?? "");
  const authors_agree = !first_author || !second_author || first_author === second_author;
  const second_forms = title_forms(second.title);
  if (title_forms(first.title).some((form) => second_forms.includes(form))) return authors_agree;
  return title_words(first.title) === title_words(second.title) && !!first_author && first_author === second_author;
}

export function merge_refs(first: CatalogRef, second: CatalogRef): CatalogRef {
  return {
    name: first.name || second.name,
    bookbrainz_id: first.bookbrainz_id || second.bookbrainz_id,
    openlibrary_id: first.openlibrary_id || second.openlibrary_id,
    hardcover_id: first.hardcover_id || second.hardcover_id,
  };
}

// Authors matched by name keep every catalogue's id; the first answer's order stays.
function merge_authors(first: CatalogRef[], second: CatalogRef[]): CatalogRef[] {
  const merged = first.map((author) => ({ ...author }));
  for (const author of second) {
    const index = merged.findIndex((each) => person_words(each.name) === person_words(author.name));
    if (index >= 0) merged[index] = merge_refs(merged[index]!, author);
    else if (first.length === 0) merged.push(author);
  }
  return merged;
}

// The first answer wins where both say something; the second fills what the first lacks.
export function merge_books(first: CatalogBook, second: CatalogBook): CatalogBook {
  const fill = <Value>(mine: Value, theirs: Value) => (mine === "" || mine === 0 || mine === null ? theirs : mine);
  return {
    sources: [...new Set([...first.sources, ...second.sources])],
    bookbrainz_id: fill(first.bookbrainz_id, second.bookbrainz_id),
    openlibrary_id: fill(first.openlibrary_id, second.openlibrary_id),
    hardcover_id: fill(first.hardcover_id, second.hardcover_id),
    other_ids: { ...second.other_ids, ...first.other_ids },
    isbn: fill(first.isbn, second.isbn),
    title: fill(first.title, second.title),
    subtitle: fill(first.subtitle, second.subtitle),
    authors: merge_authors(first.authors, second.authors),
    series: first.series && second.series ? (person_words(first.series.name) === person_words(second.series.name) ? merge_refs(first.series, second.series) : first.series) : (first.series ?? second.series),
    series_position: fill(first.series_position, second.series_position),
    year: fill(first.year, second.year),
    release_date: fill(first.release_date, second.release_date),
    overview: fill(first.overview, second.overview),
    cover_url: fill(first.cover_url, second.cover_url),
    genres: fill(first.genres, second.genres),
    pages: fill(first.pages, second.pages),
    audio_minutes: fill(first.audio_minutes, second.audio_minutes),
  };
}

// Answers from several catalogues as one list: the same book once, in the order first found.
export function join_results(lists: CatalogBook[][]): CatalogBook[] {
  const joined: CatalogBook[] = [];
  for (const list of lists) {
    for (const book of list) {
      const index = joined.findIndex((each) => same_book(each, book));
      if (index >= 0) joined[index] = merge_books(joined[index]!, book);
      else joined.push(book);
    }
  }
  return joined;
}
