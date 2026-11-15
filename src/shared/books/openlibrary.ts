// Open Library, open and keyless: searching books and authors, a work's covers, description and subjects, a book by
// ISBN, and an author's newest books for release alerts.

// ── Imports ──────────────────────────────────────────────────────────────────

import { empty_book, empty_ref, fetch_json, list_of, number_of, text_of, user_agent, type CatalogBook, type CatalogRelease, type Fetch, type Json } from "./catalog.ts";
import { clean_isbn, release_day, type CatalogRef } from "./model.ts";

// ── Requests ─────────────────────────────────────────────────────────────────

const api_base = "https://openlibrary.org";
const covers_base = "https://covers.openlibrary.org/b/id/";
const results_shown = 20;
const subjects_kept = 5;
const authors_named = 4;

export interface OpenLibrary {
  search: (query: string) => Promise<CatalogBook[]>;
  work: (work_id: string) => Promise<CatalogBook>;
  by_isbn: (isbn: string) => Promise<CatalogBook>;
  search_authors: (query: string) => Promise<CatalogRef[]>;
  // The author's books first out on or after the day given, newest first.
  author_releases: (author_id: string, since: string) => Promise<CatalogRelease[]>;
}

export function cover_of(cover_id: unknown): string {
  const id = number_of(cover_id);
  return id > 0 ? `${covers_base}${id}-L.jpg` : "";
}

// "/works/OL5738148W" or "/authors/OL1394865A" without its folder.
function key_id(key: unknown): string {
  return text_of(key).split("/").pop() ?? "";
}

// Subjects such as "series:Mistborn" name the series; ones such as "form:novel" are left out of the genres.
function read_subjects(subjects: unknown): { genres: string; series: string } {
  const all = (Array.isArray(subjects) ? subjects : []).map(text_of).filter(Boolean);
  const series = all.find((subject) => subject.toLowerCase().startsWith("series:"))?.slice("series:".length).trim() ?? "";
  const genres = all.filter((subject) => !subject.includes(":")).slice(0, subjects_kept);
  return { genres: genres.join(", "), series };
}

function first_isbn(isbns: unknown): string {
  const all = (Array.isArray(isbns) ? isbns : []).map((each) => clean_isbn(text_of(each))).filter(Boolean);
  return all.find((isbn) => isbn.length === 13) ?? all[0] ?? "";
}

function book_of_search(doc: Json): CatalogBook {
  const names = (Array.isArray(doc.author_name) ? doc.author_name : []).map(text_of);
  const keys = (Array.isArray(doc.author_key) ? doc.author_key : []).map(text_of);
  const { genres, series } = read_subjects(doc.subject);
  return {
    ...empty_book("openlibrary"),
    openlibrary_id: key_id(doc.key),
    isbn: first_isbn(doc.isbn),
    title: text_of(doc.title),
    subtitle: text_of(doc.subtitle),
    authors: names.map((name, index) => ({ ...empty_ref(name), openlibrary_id: keys[index] ?? "" })),
    series: series ? empty_ref(series) : null,
    year: text_of(doc.first_publish_year),
    cover_url: cover_of(doc.cover_i),
    genres,
    pages: number_of(doc.number_of_pages_median),
  };
}

// The earliest day among an edition list's dates, such as "Jul 25, 2006" and "2030-12-01".
function earliest_day(dates: unknown, year: unknown): string {
  const days = (Array.isArray(dates) ? dates : []).map((each) => release_day(text_of(each))).filter(Boolean).sort();
  return days[0] ?? (text_of(year) ? `${text_of(year)}-01-01` : "");
}

export function create_openlibrary(fetcher: Fetch = fetch): OpenLibrary {
  const get = (path: string, query: Record<string, string> = {}) => {
    const search = new URLSearchParams(query).toString();
    return fetch_json(fetcher, "Open Library", `${api_base}${path}${search ? `?${search}` : ""}`, { headers: { "User-Agent": user_agent } });
  };

  async function work(work_id: string): Promise<CatalogBook> {
    const json = await get(`/works/${encodeURIComponent(work_id)}.json`);
    const description = typeof json.description === "object" && json.description ? text_of((json.description as Json).value) : text_of(json.description);
    const { genres, series } = read_subjects(json.subjects);
    const identifiers = (json.identifiers ?? {}) as Json;
    const author_keys = list_of(json.authors)
      .map((entry) => key_id((entry.author as Json | undefined)?.key))
      .filter(Boolean)
      .slice(0, authors_named);
    // Names, pages and the first year come from the author records and the search index, each allowed to fail alone.
    const authors = await Promise.all(author_keys.map(async (key) => ({ ...empty_ref(text_of((await get(`/authors/${key}.json`).catch(() => ({}) as Json)).name)), openlibrary_id: key })));
    const indexed = await get("/search.json", { q: `key:/works/${work_id}`, fields: "first_publish_year,number_of_pages_median,isbn,publish_date", limit: "1" }).catch(() => ({}) as Json);
    const doc = list_of(indexed.docs)[0] ?? {};
    return {
      ...empty_book("openlibrary"),
      openlibrary_id: work_id,
      bookbrainz_id: text_of((identifiers.bookbrainz as unknown[] | undefined)?.[0]),
      isbn: first_isbn(doc.isbn),
      title: text_of(json.title),
      subtitle: text_of(json.subtitle),
      authors: authors.filter((author) => author.name),
      series: series ? empty_ref(series) : null,
      year: text_of(doc.first_publish_year) || text_of(json.first_publish_date).slice(-4),
      release_date: earliest_day(doc.publish_date, doc.first_publish_year),
      overview: description,
      cover_url: cover_of((json.covers as unknown[] | undefined)?.[0]),
      genres,
      pages: number_of(doc.number_of_pages_median),
    };
  }

  return {
    search: async (query) => {
      if (!query.trim()) return [];
      const json = await get("/search.json", {
        q: query,
        limit: String(results_shown),
        fields: "key,title,subtitle,author_name,author_key,first_publish_year,cover_i,isbn,number_of_pages_median,subject",
      });
      return list_of(json.docs).map(book_of_search);
    },
    work,
    by_isbn: async (isbn) => {
      const edition = await get(`/isbn/${encodeURIComponent(isbn)}.json`);
      const work_id = key_id(list_of(edition.works)[0]?.key);
      if (!work_id) throw new Error("Open Library has no work for that ISBN.");
      return { ...(await work(work_id)), isbn };
    },
    search_authors: async (query) => {
      if (!query.trim()) return [];
      const json = await get("/search/authors.json", { q: query, limit: "10" });
      return list_of(json.docs).map((doc) => ({ ...empty_ref(text_of(doc.name)), openlibrary_id: text_of(doc.key) }));
    },
    author_releases: async (author_id, since) => {
      const json = await get("/search.json", { author_key: author_id, sort: "new", limit: String(results_shown), fields: "key,title,author_name,first_publish_year,publish_date,cover_i" });
      return list_of(json.docs)
        .map((doc) => ({
          title: text_of(doc.title),
          authors: (Array.isArray(doc.author_name) ? doc.author_name : []).map(text_of).join(", "),
          series: "",
          series_position: "",
          release_date: earliest_day(doc.publish_date, doc.first_publish_year),
          cover_url: cover_of(doc.cover_i),
          openlibrary_id: key_id(doc.key),
          hardcover_id: "",
        }))
        .filter((release) => release.title && release.release_date >= since);
    },
  };
}
