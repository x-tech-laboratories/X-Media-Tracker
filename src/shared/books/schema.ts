// The books' tables, from which drizzle-kit writes the migrations and the store reads its row types.

// ── Imports ──────────────────────────────────────────────────────────────────

import { index, integer, primaryKey, real, sqliteTable, text } from "@x-tech-laboratories/x-libs/drizzle";

// ── Tables ───────────────────────────────────────────────────────────────────

export const books_collections = sqliteTable("books_collections", {
  id: text().primaryKey(),
  name: text().notNull(),
});

// A book's id is its strongest id, such as "bookbrainz:797946a0-…", so two devices adding the same book make one row.
export const books_books = sqliteTable(
  "books_books",
  {
    id: text().primaryKey(),
    bookbrainz_id: text().notNull().default(""),
    openlibrary_id: text().notNull().default(""),
    hardcover_id: text().notNull().default(""),
    isbn: text().notNull().default(""),
    title: text().notNull(),
    subtitle: text().notNull().default(""),
    authors: text().notNull().default(""),
    // The authors as each catalogue names them, as JSON.
    author_refs: text().notNull().default("[]"),
    series: text().notNull().default(""),
    series_position: text().notNull().default(""),
    // The series as each catalogue names it, as JSON, or "".
    series_ref: text().notNull().default(""),
    year: text().notNull().default(""),
    release_date: text().notNull().default(""),
    overview: text().notNull().default(""),
    cover_url: text().notNull().default(""),
    genres: text().notNull().default(""),
    pages: integer().notNull().default(0),
    audio_minutes: integer().notNull().default(0),
    status: text().notNull().default("want_to_read"),
    rating: real(),
    review: text().notNull().default(""),
    owned: integer().notNull().default(0),
    format: text().notNull().default(""),
    progress: real().notNull().default(0),
    progress_unit: text().notNull().default("pages"),
    moods: text().notNull().default(""),
    pace: text().notNull().default(""),
    last_read: text().notNull().default(""),
    added_at: text().notNull().default(""),
  },
  (table) => [
    index("books_books_by_bookbrainz").on(table.bookbrainz_id),
    index("books_books_by_openlibrary").on(table.openlibrary_id),
    index("books_books_by_hardcover").on(table.hardcover_id),
    index("books_books_by_isbn").on(table.isbn),
  ],
);

export const books_reads = sqliteTable(
  "books_reads",
  {
    id: text().primaryKey(),
    book_id: text()
      .notNull()
      .references(() => books_books.id, { onDelete: "cascade" }),
    started_on: text().notNull().default(""),
    finished_on: text().notNull().default(""),
    format: text().notNull().default(""),
    dnf: integer().notNull().default(0),
  },
  (table) => [index("books_reads_by_book").on(table.book_id)],
);

export const books_journal = sqliteTable(
  "books_journal",
  {
    id: text().primaryKey(),
    book_id: text()
      .notNull()
      .references(() => books_books.id, { onDelete: "cascade" }),
    written_on: text().notNull(),
    page: integer(),
    text: text().notNull(),
  },
  (table) => [index("books_journal_by_book").on(table.book_id)],
);

export const books_book_collections = sqliteTable(
  "books_book_collections",
  {
    book_id: text()
      .notNull()
      .references(() => books_books.id, { onDelete: "cascade" }),
    collection_id: text()
      .notNull()
      .references(() => books_collections.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.book_id, table.collection_id] }), index("books_book_collections_by_collection").on(table.collection_id)],
);

// An author or series followed for its new books; its id is its strongest catalogue id, such as "author:openlibrary:OL1394865A".
export const books_follows = sqliteTable("books_follows", {
  id: text().primaryKey(),
  kind: text().notNull(),
  name: text().notNull(),
  bookbrainz_id: text().notNull().default(""),
  openlibrary_id: text().notNull().default(""),
  hardcover_id: text().notNull().default(""),
  followed_at: text().notNull().default(""),
  // When its releases were first checked; books found in that check fill Upcoming without an alert.
  checked_at: text().notNull().default(""),
});

// A book a followed author or series has announced or released, keyed by its catalogue id so two devices find it once.
export const books_releases = sqliteTable(
  "books_releases",
  {
    id: text().primaryKey(),
    follow_id: text()
      .notNull()
      .references(() => books_follows.id, { onDelete: "cascade" }),
    title: text().notNull(),
    authors: text().notNull().default(""),
    series: text().notNull().default(""),
    series_position: text().notNull().default(""),
    release_date: text().notNull().default(""),
    cover_url: text().notNull().default(""),
    openlibrary_id: text().notNull().default(""),
    hardcover_id: text().notNull().default(""),
    found_at: text().notNull().default(""),
    seen: integer().notNull().default(0),
    notified_at: text().notNull().default(""),
  },
  (table) => [index("books_releases_by_follow").on(table.follow_id)],
);

// A reading goal, the books to finish in one year.
export const books_goals = sqliteTable("books_goals", {
  year: text().primaryKey(),
  target: integer().notNull(),
});

// Parents first, as sync applies them.
export const books_tables = [books_collections, books_books, books_reads, books_journal, books_book_collections, books_follows, books_releases, books_goals];
