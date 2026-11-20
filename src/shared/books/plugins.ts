// The book catalogues as bundled plugins, each providing its catalogue to the books store; Hardcover with the key from
// its own settings, and saying so while none is set.

// ── Imports ──────────────────────────────────────────────────────────────────

import { define_plugin } from "@x-tech-laboratories/x-libs/plugins";

import type { MediaPlugin, MediaPluginApi } from "../plugins/host.ts";
import { create_bookbrainz } from "./bookbrainz.ts";
import type { BookCatalog } from "./catalog.ts";
import { create_hardcover } from "./hardcover.ts";
import { bookbrainz_manifest, hardcover_manifest, openlibrary_manifest } from "./manifests.ts";
import { parse_openlibrary_id } from "./model.ts";
import { create_openlibrary } from "./openlibrary.ts";

// ── Plugins ──────────────────────────────────────────────────────────────────

export const openlibrary_plugin = define_plugin<MediaPluginApi>({
  ...openlibrary_manifest,
  start: (context) => {
    const openlibrary = create_openlibrary();
    context.provide("book_catalog", "openlibrary", {
      source: "openlibrary",
      missing: "",
      book: openlibrary.work,
      by_isbn: openlibrary.by_isbn,
      own_id: async (input) => {
        const parsed = parse_openlibrary_id(input);
        if (!parsed) throw new Error(`${input} is not an Open Library work or edition, such as OL5738148W or OL7353617M.`);
        return parsed.kind === "work" ? parsed.id : openlibrary.edition_work(parsed.id);
      },
      search: openlibrary.search,
      search_refs: (query, kind) => (kind === "author" ? openlibrary.search_authors(query) : Promise.resolve([])),
      release_kinds: ["author"],
      releases: (kind, id, since) => (kind === "author" ? openlibrary.author_releases(id, since) : Promise.resolve([])),
    } satisfies BookCatalog);
  },
});

export const hardcover_plugin = define_plugin<MediaPluginApi>({
  ...hardcover_manifest,
  start: (context) => {
    const key = String(context.settings().api_key ?? "").trim();
    const refuse = () => Promise.reject(new Error("no key set"));
    if (!key) {
      context.provide("book_catalog", "hardcover", { source: "hardcover", missing: "no key set", book: refuse, search: refuse, search_refs: refuse });
      return;
    }
    const hardcover = create_hardcover(key);
    context.provide("book_catalog", "hardcover", {
      source: "hardcover",
      missing: "",
      book: hardcover.book,
      by_isbn: hardcover.book_by_isbn,
      by_slug: hardcover.book_by_slug,
      search: hardcover.search,
      search_refs: hardcover.search_refs,
      series: hardcover.series,
      release_kinds: ["author", "series"],
      releases: hardcover.releases,
    } satisfies BookCatalog);
  },
});

export const bookbrainz_plugin = define_plugin<MediaPluginApi>({
  ...bookbrainz_manifest,
  start: (context) => {
    const bookbrainz = create_bookbrainz();
    context.provide("book_catalog", "bookbrainz", { source: "bookbrainz", missing: "", book: bookbrainz.work, search: bookbrainz.search, search_refs: bookbrainz.search_refs, series: bookbrainz.series } satisfies BookCatalog);
  },
});

// In the order their searches are joined.
export const book_catalog_plugins: MediaPlugin[] = [openlibrary_plugin, hardcover_plugin, bookbrainz_plugin];
