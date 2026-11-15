// Hardcover, through its GraphQL API and the user's own key, which needs only the read:catalog scope: searching books,
// authors and series, a book's details, a series in order, and the upcoming books of an author or series for release
// alerts. The key rides in a header, so no error ever repeats it.

// ── Imports ──────────────────────────────────────────────────────────────────

import { empty_book, empty_ref, fetch_json, list_of, number_of, text_of, user_agent, type CatalogBook, type CatalogRelease, type CatalogSeries, type Fetch, type Json } from "./catalog.ts";
import { clean_isbn, sort_series, type CatalogRef } from "./model.ts";

// ── Requests ─────────────────────────────────────────────────────────────────

const api_address = "https://api.hardcover.app/v1/graphql";
const results_shown = 20;
const genres_kept = 5;

// Where a user makes a key that can read the catalogue and nothing of their account.
export const hardcover_key_link = "https://hardcover.app/account/api/keys/new?scope=read:catalog";

export interface Hardcover {
  search: (query: string) => Promise<CatalogBook[]>;
  book: (book_id: string) => Promise<CatalogBook>;
  book_by_slug: (slug: string) => Promise<CatalogBook>;
  book_by_isbn: (isbn: string) => Promise<CatalogBook>;
  search_refs: (query: string, kind: "author" | "series") => Promise<CatalogRef[]>;
  series: (series_id: string) => Promise<CatalogSeries>;
  // Books first out on or after the day given, by an author or in a series.
  releases: (kind: "author" | "series", id: string, since: string) => Promise<CatalogRelease[]>;
}

const book_fields = `
  id title subtitle description release_date release_year pages audio_seconds cached_tags
  image { url }
  contributions(where: {contributor_role: {slug: {_eq: "author"}}}) { author { id name } }
  featured_book_series { position series { id name } }
  default_physical_edition { isbn_13 isbn_10 pages }
`;

// Hardcover's tags by kind, such as {"Genre": [{"tag": "Fantasy"}]}.
function genres_of(tags: unknown): string {
  const genre_tags = list_of((tags as Json | null)?.Genre);
  return genre_tags
    .map((each) => text_of(each.tag))
    .filter(Boolean)
    .slice(0, genres_kept)
    .join(", ");
}

function position_text(value: unknown): string {
  const number = Number(value);
  return value === null || value === undefined || !Number.isFinite(number) ? "" : String(number);
}

function book_of(json: Json): CatalogBook {
  const featured = json.featured_book_series as Json | null;
  const series = featured?.series as Json | undefined;
  const edition = (json.default_physical_edition ?? {}) as Json;
  return {
    ...empty_book("hardcover"),
    hardcover_id: text_of(json.id),
    isbn: clean_isbn(text_of(edition.isbn_13)) || clean_isbn(text_of(edition.isbn_10)),
    title: text_of(json.title),
    subtitle: text_of(json.subtitle),
    authors: list_of(json.contributions).map((each) => {
      const author = (each.author ?? {}) as Json;
      return { ...empty_ref(text_of(author.name)), hardcover_id: text_of(author.id) };
    }),
    series: series ? { ...empty_ref(text_of(series.name)), hardcover_id: text_of(series.id) } : null,
    series_position: position_text(featured?.position),
    year: text_of(json.release_year) || text_of(json.release_date).slice(0, 4),
    release_date: text_of(json.release_date),
    overview: text_of(json.description),
    cover_url: text_of((json.image as Json | null)?.url),
    genres: genres_of(json.cached_tags),
    pages: number_of(json.pages) || number_of(edition.pages),
    audio_minutes: Math.round(number_of(json.audio_seconds) / 60),
  };
}

// A search hit's document, which carries fewer fields than a book.
function book_of_hit(document: Json): CatalogBook {
  const contributions = list_of(document.contributions);
  const names = (Array.isArray(document.author_names) ? document.author_names : []).map(text_of);
  const featured = (document.featured_series ?? {}) as Json;
  const series = (featured.series ?? null) as Json | null;
  return {
    ...empty_book("hardcover"),
    hardcover_id: text_of(document.id),
    isbn: (Array.isArray(document.isbns) ? document.isbns : []).map((each) => clean_isbn(text_of(each))).find((each) => each.length === 13) ?? "",
    title: text_of(document.title),
    subtitle: text_of(document.subtitle),
    authors: contributions.length
      ? contributions.map((each) => ({ ...empty_ref(text_of((each.author as Json | undefined)?.name)), hardcover_id: text_of((each.author as Json | undefined)?.id) }))
      : names.map((name) => empty_ref(name)),
    series: series ? { ...empty_ref(text_of(series.name)), hardcover_id: text_of(series.id) } : null,
    series_position: position_text(featured.position ?? document.featured_series_position),
    year: text_of(document.release_year),
    overview: text_of(document.description),
    cover_url: text_of((document.image as Json | null)?.url),
    genres: (Array.isArray(document.genres) ? document.genres : []).map(text_of).slice(0, genres_kept).join(", "),
    pages: number_of(document.pages),
    audio_minutes: Math.round(number_of(document.audio_seconds) / 60),
  };
}

function release_of(json: Json, series_name = "", position: unknown = null): CatalogRelease {
  const book = book_of(json);
  return {
    title: book.title,
    authors: book.authors.map((author) => author.name).join(", "),
    series: series_name || book.series?.name || "",
    series_position: position_text(position) || book.series_position,
    release_date: book.release_date,
    cover_url: book.cover_url,
    openlibrary_id: "",
    hardcover_id: book.hardcover_id,
  };
}

export function create_hardcover(key: string, fetcher: Fetch = fetch): Hardcover {
  // A key copied from Hardcover's page may start with "Bearer ".
  const token = key.trim().replace(/^bearer\s+/i, "");
  if (!token) throw new Error("Set a Hardcover API key in Settings → Books first.");

  async function query(text: string, variables: Record<string, unknown> = {}): Promise<Json> {
    const answer = await fetch_json(fetcher, "Hardcover", api_address, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "User-Agent": user_agent },
      body: JSON.stringify({ query: text, variables }),
    }).catch((error: Error) => {
      throw new Error(error.message.includes("HTTP 401") ? "Hardcover refused the API key; make a new one in Settings → Books." : error.message);
    });
    const errors = list_of(answer.errors);
    if (errors.length) throw new Error(`Hardcover: ${text_of(errors[0]!.message) || "the query failed"}`);
    return (answer.data ?? {}) as Json;
  }

  async function first_book(where: string, variables: Record<string, unknown>): Promise<CatalogBook> {
    const data = await query(`query ($value: ${where.startsWith("id") ? "Int" : "String"}!) { books(where: {${where}: {_eq: $value}}, limit: 1) { ${book_fields} } }`, variables);
    const found = list_of(data.books)[0];
    if (!found) throw new Error("Hardcover has no such book.");
    return book_of(found);
  }

  async function search_hits(text: string, query_type: string): Promise<Json[]> {
    if (!text.trim()) return [];
    const data = await query(`query ($text: String!, $type: String!, $count: Int!) { search(query: $text, query_type: $type, per_page: $count, page: 1) { results } }`, { text, type: query_type, count: results_shown });
    const results = ((data.search as Json | undefined)?.results ?? {}) as Json;
    return list_of(results.hits).map((hit) => (hit.document ?? {}) as Json);
  }

  return {
    search: async (text) => (await search_hits(text, "Book")).map(book_of_hit),
    book: (book_id) => first_book("id", { value: Number(book_id) }),
    book_by_slug: (slug) => first_book("slug", { value: slug }),
    book_by_isbn: async (isbn) => {
      const field = isbn.length === 13 ? "isbn_13" : "isbn_10";
      const data = await query(`query ($isbn: String!) { editions(where: {${field}: {_eq: $isbn}}, limit: 1) { book { ${book_fields} } } }`, { isbn });
      const edition = list_of(data.editions)[0];
      if (!edition?.book) throw new Error("Hardcover has no book with that ISBN.");
      return { ...book_of(edition.book as Json), isbn };
    },
    search_refs: async (text, kind) => (await search_hits(text, kind === "author" ? "Author" : "Series")).map((document) => ({ ...empty_ref(text_of(document.name)), hardcover_id: text_of(document.id) })),

    // One book per position, duplicates, partial books and compilations left out, as Hardcover's series page shows it.
    series: async (series_id) => {
      const data = await query(
        `query ($id: Int!) { series(where: {id: {_eq: $id}}) { id name book_series(distinct_on: position, order_by: [{position: asc}, {book: {users_count: desc}}], where: {book: {canonical_id: {_is_null: true}, is_partial_book: {_eq: false}}, compilation: {_eq: false}}) { position book { id title release_date image { url } } } } }`,
        { id: Number(series_id) },
      );
      const series = list_of(data.series)[0];
      if (!series) throw new Error("Hardcover has no such series.");
      return {
        ...empty_ref(text_of(series.name)),
        hardcover_id: text_of(series.id),
        books: sort_series(
          list_of(series.book_series).map((entry) => {
            const book = (entry.book ?? {}) as Json;
            return { position: position_text(entry.position), title: text_of(book.title), release_date: text_of(book.release_date), cover_url: text_of((book.image as Json | null)?.url), ids: { hardcover_id: text_of(book.id) } };
          }),
        ),
      };
    },

    releases: async (kind, id, since) => {
      if (kind === "series") {
        const data = await query(
          `query ($id: Int!, $since: date!) { series(where: {id: {_eq: $id}}) { name book_series(where: {book: {release_date: {_gte: $since}, canonical_id: {_is_null: true}}}, order_by: {position: asc}) { position book { ${book_fields} } } } }`,
          { id: Number(id), since },
        );
        const series = list_of(data.series)[0];
        return list_of(series?.book_series).map((entry) => release_of((entry.book ?? {}) as Json, text_of(series?.name), entry.position));
      }
      const data = await query(
        `query ($id: Int!, $since: date!) { books(where: {contributions: {author_id: {_eq: $id}, contributable_type: {_eq: "Book"}}, release_date: {_gte: $since}, canonical_id: {_is_null: true}}, order_by: {release_date: asc}, limit: ${results_shown}) { ${book_fields} } }`,
        { id: Number(id), since },
      );
      return list_of(data.books).map((book) => release_of(book));
    },
  };
}
