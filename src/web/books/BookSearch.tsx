// Searching books from the top bar: the library's own books and the catalogues' at once on a results page, each found
// book added with a button, or a pasted link or ISBN added straight away.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useState } from "react";
import { Badge } from "@x-tech-laboratories/x-libs/web/react/badges";
import { MediaGrid, MediaTile } from "@x-tech-laboratories/x-libs/web/react/media";
import { SearchBox } from "@x-tech-laboratories/x-libs/web/react/controls";
import { PageHeading, Section, Stack } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Empty, Failure, Loaded, Skeleton, use_resource } from "@x-tech-laboratories/x-libs/web/react/states";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";

import { calls, use_data } from "../api.ts";
import { catalog_labels, type CatalogSource } from "../../shared/books/catalog.ts";
import { book_links, book_status_labels, filter_books, no_book_filters, parse_book_link } from "../../shared/books/model.ts";
import type { BookSearchResult } from "../../shared/books/store.ts";
import { book_href, book_search_href, report_added } from "./actions.tsx";

// ── Top bar ──────────────────────────────────────────────────────────────────

// Enter opens the results page; a pasted link or ISBN is added at once instead.
export function BookSearchBar() {
  const [query, set_query] = useState("");
  const add_link = async (link: string) => {
    try {
      report_added(await calls().add_book_from_link(link));
      set_query("");
    } catch (error) {
      toast((error as Error).message, { tone: "bad" });
    }
  };
  return (
    <SearchBox
      label="Search your books and the catalogues, or paste a link or ISBN"
      value={query}
      submit_label={parse_book_link(query) ? "Add" : "Search"}
      on_input={set_query}
      on_submit={(text) => {
        if (!text.trim()) return;
        if (parse_book_link(text)) void add_link(text);
        else window.location.hash = book_search_href(text.trim());
      }}
    />
  );
}

// ── Results ──────────────────────────────────────────────────────────────────

function LibraryMatches({ query }: { query: string }) {
  const books = use_data((api) => api.list_books());
  return (
    <Section title="In your library">
      <Loaded resource={books}>
        {(loaded) => {
          const found = filter_books(loaded.books, { ...no_book_filters, search: query });
          if (found.length === 0) return <Empty title={`Nothing in your library matches “${query}”.`} />;
          return (
            <MediaGrid label="In your library">
              {found.map((book) => (
                <MediaTile key={book.id} title={book.title} href={book_href(book.id)} image={book.cover_url} lines={[book.authors, book_status_labels[book.status]]} />
              ))}
            </MediaGrid>
          );
        }}
      </Loaded>
    </Section>
  );
}

// The catalogue to add a result from: the one whose id names it best.
function source_of(result: BookSearchResult): [string, string] {
  if (result.bookbrainz_id) return ["bookbrainz", result.bookbrainz_id];
  if (result.openlibrary_id) return ["openlibrary", result.openlibrary_id];
  if (result.hardcover_id) return ["hardcover", result.hardcover_id];
  const [other] = Object.entries(result.other_ids);
  return other ?? ["isbn", result.isbn];
}

function result_key(result: BookSearchResult): string {
  return source_of(result).join(":");
}

function CatalogMatches({ query }: { query: string }) {
  const search = use_resource(() => calls().search_books(query), [query]);
  const [added, set_added] = useState<Record<string, string>>({});
  const [adding, set_adding] = useState<string | null>(null);

  const add = async (result: BookSearchResult) => {
    const key = result_key(result);
    set_adding(key);
    try {
      const done = await calls().add_book(...source_of(result));
      report_added(done);
      set_added({ ...added, [key]: done.id });
    } catch (error) {
      toast((error as Error).message, { tone: "bad" });
    } finally {
      set_adding(null);
    }
  };

  return (
    <Section title="From the catalogues">
      {search.status === "loading" && <Skeleton lines={4} />}
      {search.status === "failed" && <Failure error={search.error} retry={() => void search.reload()} />}
      {search.data && search.data.failures.length > 0 && <p className="muted">Left out: {search.data.failures.join("; ")}</p>}
      {search.data &&
        (search.data.results.length === 0 ? (
          <Empty title={`No catalogue has anything for “${query}”.`} />
        ) : (
          <MediaGrid label="From the catalogues">
            {search.data.results.map((result) => {
              const key = result_key(result);
              const tracked_id = result.tracked_id || added[key];
              return (
                <MediaTile
                  key={key}
                  title={result.title}
                  href={tracked_id ? book_href(tracked_id) : (book_links(result)[0]?.href ?? "#/books")}
                  image={result.cover_url}
                  lines={[[result.authors.map((author) => author.name).join(", "), result.year].filter(Boolean).join(" · "), result.sources.map((source) => search.data!.labels[source] ?? catalog_labels[source as CatalogSource] ?? source).join(", ")]}
                  actions={
                    tracked_id ? (
                      <Badge tone="good">✓ In library</Badge>
                    ) : (
                      <button type="button" disabled={adding !== null} onClick={() => void add(result)}>
                        {adding === key ? "Adding…" : "Add"}
                      </button>
                    )
                  }
                />
              );
            })}
          </MediaGrid>
        ))}
    </Section>
  );
}

export function BookSearchView({ query }: { query: string }) {
  return (
    <div className="books-page">
      <Stack>
        <PageHeading title="Search" subtitle={`Results for “${query}” in your books and the catalogues.`} />
        <LibraryMatches query={query} />
        <CatalogMatches query={query} />
      </Stack>
    </div>
  );
}
