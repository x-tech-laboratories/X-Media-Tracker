// The Books library: every tracked book as a cover or a table row, narrowed by status, format, owned and collection, each
// choice showing how many books it would leave, and sorted.

// ── Imports ──────────────────────────────────────────────────────────────────

import { MediaGrid, MediaTile } from "@x-tech-laboratories/x-libs/web/react/media";
import { MenuButton } from "@x-tech-laboratories/x-libs/web/react/menu_button";
import { Segmented, Select } from "@x-tech-laboratories/x-libs/web/react/controls";
import { PageHeading, Stack, Toolbar } from "@x-tech-laboratories/x-libs/web/react/layout";
import { ProgressBar } from "@x-tech-laboratories/x-libs/web/react/progress";
import { Empty, Loaded } from "@x-tech-laboratories/x-libs/web/react/states";
import { DataTable, type TableColumn } from "@x-tech-laboratories/x-libs/web/react/table";
import { is_boolean, one_of } from "@x-tech-laboratories/x-libs/web/prefs";
import { use_pref } from "@x-tech-laboratories/x-libs/web/react/prefs";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";

import { calls, use_data } from "../api.ts";
import { use_refresh } from "../refresh.ts";
import {
  book_facet_counts,
  book_format_labels,
  book_formats,
  book_sort_keys,
  book_sort_labels,
  book_status_labels,
  book_statuses,
  filter_books,
  no_book_filters,
  progress_share,
  sort_books,
  type BookFilters,
  type BookSortKey,
  type LibraryBook,
} from "../../shared/books/model.ts";
import type { Books, BooksRefreshReport } from "../../shared/books/store.ts";
import { book_href, book_status_menu_items, stars_text } from "./actions.tsx";

// ── Remembered view ──────────────────────────────────────────────────────────

function is_filters(value: unknown): value is Omit<BookFilters, "search"> {
  const filters = value as Partial<BookFilters> | null;
  return !!filters && typeof filters.status === "string" && typeof filters.format === "string" && typeof filters.owned === "string" && typeof filters.collection === "string";
}

const { search: _search, ...remembered_defaults } = no_book_filters;

type Layout = "covers" | "table";

// ── Tiles ────────────────────────────────────────────────────────────────────

function corner_text(book: LibraryBook): string {
  const share = book.status === "reading" ? progress_share(book) : null;
  if (share !== null) return `${Math.round(share * 100)}%`;
  return stars_text(book.rating);
}

function BookActions({ book }: { book: LibraryBook }) {
  const remove = async () => {
    await calls().remove_book(book.id);
    toast(`Removed ${book.title}.`, { link: { href: "#/history", text: "History" } });
  };
  return <MenuButton label={`${book.title} actions`} items={() => [...book_status_menu_items(book), { label: "Remove", danger: true, separator_before: true, run: () => void remove() }]} />;
}

function BookTile({ book }: { book: LibraryBook }) {
  return (
    <MediaTile
      title={book.title}
      href={book_href(book.id)}
      image={book.cover_url}
      corner={corner_text(book) || undefined}
      lines={[[book.authors, book.year].filter(Boolean).join(" · "), book_status_labels[book.status]]}
      dimmed={book.status === "dnf"}
      actions={<BookActions book={book} />}
    />
  );
}

const table_columns: TableColumn<LibraryBook>[] = [
  { label: "Title", cell: (book) => <a href={book_href(book.id)}>{book.title}</a> },
  { label: "Author", cell: (book) => book.authors || "—" },
  { label: "Series", cell: (book) => (book.series ? `${book.series}${book.series_position ? ` #${book.series_position}` : ""}` : "—") },
  { label: "Year", cell: (book) => book.year || "—" },
  { label: "Status", cell: (book) => book_status_labels[book.status] },
  { label: "Rating", cell: (book) => stars_text(book.rating) || "—" },
  { label: "Reads", cell: (book) => String(book.read_count) },
  { label: "Last read", cell: (book) => book.last_read || "—" },
  { label: "Added", cell: (book) => book.added_at || "—" },
  { label: "Actions", id: "actions", header: <span className="visually-hidden">Actions</span>, class: "actions-cell", cell: (book) => <BookActions book={book} /> },
];

function BookList({ books, layout }: { books: LibraryBook[]; layout: Layout }) {
  if (layout === "table") return <DataTable caption="Books" columns={table_columns} rows={books} row_key={(book) => book.id} />;
  return (
    <MediaGrid label="Books">
      {books.map((book) => (
        <BookTile key={book.id} book={book} />
      ))}
    </MediaGrid>
  );
}

function with_count(label: string, count: number | undefined): string {
  return `${label} (${count ?? 0})`;
}

// ── Refresh ──────────────────────────────────────────────────────────────────

function use_books_refresh() {
  return use_refresh(
    () => calls().get_books_refresh(),
    () => calls().refresh_books(),
    (report: BooksRefreshReport) => `Refreshed ${report.total} books: ${report.updated} updated${report.failed ? `, ${report.failed} not found` : ""}.`,
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

function LibraryPage({ library }: { library: Books }) {
  const [remembered, set_remembered] = use_pref("x-media-tracker-books-filters", remembered_defaults, is_filters);
  const [sort_key, set_sort_key] = use_pref<BookSortKey>("x-media-tracker-books-sort", "title", one_of(...book_sort_keys));
  const [descending, set_descending] = use_pref("x-media-tracker-books-descending", false, is_boolean);
  const [layout, set_layout] = use_pref<Layout>("x-media-tracker-books-layout", "covers", one_of("covers", "table"));
  const { refresh, start: start_refresh } = use_books_refresh();
  const refreshing = refresh?.state === "running";

  // A remembered collection that is gone stops applying.
  const collection = remembered.collection === "all" || remembered.collection === "none" || library.collections.some((each) => each.id === remembered.collection) ? remembered.collection : "all";
  const filters: BookFilters = { ...remembered, search: "", collection };
  const set_filter = (change: Partial<BookFilters>) => set_remembered({ ...remembered, ...change });
  const counts = book_facet_counts(library.books, filters);
  const shown = sort_books(filter_books(library.books, filters), sort_key, descending);

  return (
    <Stack>
      <PageHeading
        title="Books"
        subtitle={`${shown.length} of ${library.books.length} books`}
        actions={
          <button type="button" disabled={refreshing} onClick={start_refresh}>
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        }
      />
      {refreshing && <ProgressBar value={refresh.total ? refresh.done : null} max={refresh.total} label="Refreshing from the catalogues" detail={`${refresh.done} of ${refresh.total} books`} />}
      <Toolbar>
        <Segmented
          label="Status"
          choices={[{ value: "all", label: with_count("Any status", counts.status.all) }, ...book_statuses.map((status) => ({ value: status, label: with_count(book_status_labels[status], counts.status[status]) }))]}
          value={filters.status}
          on_change={(status) => set_filter({ status })}
        />
        <Select
          label="Format"
          options={[
            ["all", with_count("Any format", counts.format.all)],
            ...book_formats.filter(Boolean).map((format) => [format, with_count(book_format_labels[format], counts.format[format])] as [string, string]),
            ["", with_count("Not said", counts.format[""])],
          ]}
          value={filters.format}
          on_change={(format) => set_filter({ format: format as BookFilters["format"] })}
        />
        <Select
          label="Owned"
          options={[
            ["all", with_count("Owned or not", counts.owned.all)],
            ["owned", with_count("Owned", counts.owned.owned)],
            ["not_owned", with_count("Not owned", counts.owned.not_owned)],
          ]}
          value={filters.owned}
          on_change={(owned) => set_filter({ owned: owned as BookFilters["owned"] })}
        />
        {library.collections.length > 0 && (
          <Select
            label="Collection"
            options={[
              ["all", with_count("Any collection", counts.collection.all)],
              ["none", with_count("None", counts.collection.none)],
              ...library.collections.map((each) => [each.id, with_count(each.name, counts.collection[each.id])] as [string, string]),
            ]}
            value={filters.collection}
            on_change={(chosen) => set_filter({ collection: chosen })}
          />
        )}
        <Select label="Sort by" options={book_sort_keys.map((key) => [key, book_sort_labels[key]] as [BookSortKey, string])} value={sort_key} on_change={set_sort_key} />
        <button type="button" className="icon" aria-label={descending ? "Sort ascending" : "Sort descending"} onClick={() => set_descending(!descending)}>
          {descending ? "↓" : "↑"}
        </button>
        <Segmented
          label="Layout"
          choices={[
            { value: "covers", label: "Covers" },
            { value: "table", label: "Table" },
          ]}
          value={layout}
          on_change={set_layout}
        />
      </Toolbar>
      {library.books.length === 0 ? (
        <Empty title="No books yet." hint="Search for a book in the bar at the top, paste a link or an ISBN, or import a StoryGraph export under Settings → Books." />
      ) : shown.length === 0 ? (
        <Empty title="No books match these filters." />
      ) : (
        <BookList books={shown} layout={layout} />
      )}
    </Stack>
  );
}

export function BooksLibrary() {
  const library = use_data((api) => api.list_books());
  return (
    <div className="books-page">
      <Loaded resource={library}>{(loaded) => <LibraryPage library={loaded} />}</Loaded>
    </div>
  );
}
