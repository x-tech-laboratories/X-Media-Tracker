// BookBrainz, the open book database: searching works, authors and series, and a work's authors, series, first edition
// and its link to Open Library. It has no covers, so Open Library fills those in.

// ── Imports ──────────────────────────────────────────────────────────────────

import { empty_book, empty_ref, fetch_json, list_of, number_of, text_of, user_agent, type CatalogBook, type CatalogSeries, type Fetch, type Json } from "./catalog.ts";
import { clean_isbn, release_day, sort_series, type CatalogRef } from "./model.ts";

// ── Requests ─────────────────────────────────────────────────────────────────

const api_base = "https://api.bookbrainz.org/1";
const results_shown = 10;
const authors_named = 4;
const series_books_read = 40;

export type BookBrainzEntity = "work" | "author" | "series";

export interface BookBrainz {
  search: (query: string) => Promise<CatalogBook[]>;
  work: (work_id: string) => Promise<CatalogBook>;
  search_refs: (query: string, entity: "author" | "series") => Promise<CatalogRef[]>;
  series: (series_id: string) => Promise<CatalogSeries>;
}

interface Relationship {
  type: string;
  direction: string;
  target: string;
  target_type: string;
}

function name_of(json: Json): string {
  return text_of((json.defaultAlias as Json | undefined)?.name);
}

function relationships_of(json: Json): Relationship[] {
  return list_of(json.relationships).map((each) => ({
    type: text_of(each.relationshipTypeName),
    direction: text_of(each.direction),
    target: text_of(each.targetBbid),
    target_type: text_of(each.targetEntityType).toLowerCase(),
  }));
}

function identifier(json: Json, type: string): string {
  return text_of(list_of(json.identifiers).find((each) => text_of(each.type) === type)?.value);
}

export function create_bookbrainz(fetcher: Fetch = fetch): BookBrainz {
  const get = (path: string) => fetch_json(fetcher, "BookBrainz", `${api_base}${path}`, { headers: { "User-Agent": user_agent } });
  const search = (query: string, entity: BookBrainzEntity) => get(`/search?${new URLSearchParams({ q: query, type: entity, size: String(results_shown) })}`);

  return {
    search: async (query) => {
      if (!query.trim()) return [];
      const json = await search(query, "work");
      return list_of(json.searchResult).map((hit) => ({ ...empty_book("bookbrainz"), bookbrainz_id: text_of(hit.bbid), title: name_of(hit) }));
    },

    // Each part beyond the work itself may fail alone and leave the rest.
    work: async (work_id) => {
      const id = encodeURIComponent(work_id);
      const work = await get(`/work/${id}`);
      const [relations, identifiers] = await Promise.all([get(`/work/${id}/relationships`).catch(() => ({}) as Json), get(`/work/${id}/identifiers`).catch(() => ({}) as Json)]);
      const related = relationships_of(relations);
      const author_ids = related.filter((each) => each.type === "Writer" && each.target_type === "author").map((each) => each.target).slice(0, authors_named);
      const series_id = related.find((each) => each.target_type === "series")?.target ?? "";
      const edition_id = related.find((each) => each.type === "Contains" && each.target_type === "edition")?.target ?? "";
      const [authors, series, edition, edition_identifiers] = await Promise.all([
        Promise.all(author_ids.map(async (author_id) => ({ ...empty_ref(name_of(await get(`/author/${author_id}`).catch(() => ({}) as Json))), bookbrainz_id: author_id }))),
        series_id ? get(`/series/${series_id}`).catch(() => null) : null,
        edition_id ? get(`/edition/${edition_id}`).catch(() => null) : null,
        edition_id ? get(`/edition/${edition_id}/identifiers`).catch(() => null) : null,
      ]);
      const released = release_day(text_of(edition?.releaseEventDate).replace(/^\+0*/, ""));
      return {
        ...empty_book("bookbrainz"),
        bookbrainz_id: work_id,
        openlibrary_id: identifier(identifiers, "OpenLibrary Work ID"),
        isbn: edition_identifiers ? clean_isbn(identifier(edition_identifiers, "ISBN-13") || identifier(edition_identifiers, "ISBN-10")) : "",
        title: name_of(work),
        authors: authors.filter((author) => author.name),
        series: series ? { ...empty_ref(name_of(series)), bookbrainz_id: series_id } : null,
        year: released.slice(0, 4),
        pages: number_of(edition?.pages),
      };
    },

    search_refs: async (query, entity) => {
      if (!query.trim()) return [];
      const json = await search(query, entity);
      return list_of(json.searchResult).map((hit) => ({ ...empty_ref(name_of(hit)), bookbrainz_id: text_of(hit.bbid) }));
    },

    // BookBrainz does not say where each work sits in a series, so they come in title order.
    series: async (series_id) => {
      const id = encodeURIComponent(series_id);
      const [series, relations] = await Promise.all([get(`/series/${id}`), get(`/series/${id}/relationships`).catch(() => ({}) as Json)]);
      const work_ids = relationships_of(relations)
        .filter((each) => each.target_type === "work")
        .map((each) => each.target)
        .slice(0, series_books_read);
      const works = await Promise.all(work_ids.map(async (work_id) => ({ work_id, json: await get(`/work/${work_id}`).catch(() => null) })));
      return {
        ...empty_ref(name_of(series)),
        bookbrainz_id: series_id,
        books: sort_series(works.filter((work) => work.json).map((work) => ({ position: "", title: name_of(work.json!), release_date: "", cover_url: "", ids: { bookbrainz_id: work.work_id } }))),
      };
    },
  };
}
