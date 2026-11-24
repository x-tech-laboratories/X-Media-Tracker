// Books in and out as files: books with their reads, journal and collections, the authors and series followed, and the
// reading goals.

// ── Imports ──────────────────────────────────────────────────────────────────

import { and, eq } from "@x-tech-laboratories/x-libs/drizzle";
import { in_transaction, type SqlDatabase } from "@x-tech-laboratories/x-libs/sql";

import { drizzle_of, new_id } from "../feature.ts";
import { meet_row, read_transfer, transfer_csv, transfer_file, type ImportConflict, type Row, type TransferFile, type TransferInput, type TransferReport, type TransferTable } from "../transfer.ts";
import { book_key, clean_other_ids, is_book_format, is_book_status, is_progress_unit } from "./model.ts";
import { books_book_collections, books_books, books_collections, books_follows, books_goals, books_journal, books_reads } from "./schema.ts";
import { find_book, find_by_title, settle_last_read } from "./store.ts";

// ── Tables ───────────────────────────────────────────────────────────────────

const text_columns = (names: string[]) => Object.fromEntries(names.map((name) => [name, "text" as const]));

const tables: TransferTable[] = [
  {
    name: "books",
    required: true,
    columns: {
      ...text_columns(["id", "bookbrainz_id", "openlibrary_id", "hardcover_id", "isbn", "other_ids", "title", "subtitle", "authors", "author_refs", "series", "series_position", "series_ref", "year", "release_date", "overview", "cover_url", "genres"]),
      pages: "number",
      audio_minutes: "number",
      status: "text",
      rating: "nullable_number",
      ...text_columns(["review", "notes"]),
      owned: "number",
      format: "text",
      progress: "number",
      ...text_columns(["progress_unit", "moods", "pace", "added_at"]),
    },
  },
  { name: "reads", columns: { ...text_columns(["id", "book_id", "started_on", "finished_on", "format"]), dnf: "number" } },
  { name: "journal", columns: { ...text_columns(["id", "book_id", "written_on"]), page: "nullable_number", text: "text" } },
  { name: "collections", columns: text_columns(["id", "name"]) },
  { name: "book_collections", columns: text_columns(["book_id", "collection_id"]) },
  { name: "follows", columns: text_columns(["id", "kind", "name", "bookbrainz_id", "openlibrary_id", "hardcover_id", "followed_at"]) },
  { name: "goals", columns: { year: "text", target: "number" } },
];

// What only the user says of a book, so the file saying otherwise is a choice for the merge window.
const own_columns = ["status", "rating", "review", "notes", "owned", "format", "progress", "progress_unit", "moods", "pace"];

const id_columns = ["bookbrainz_id", "openlibrary_id", "hardcover_id", "isbn"] as const;

// ── Export ───────────────────────────────────────────────────────────────────

function books_rows(database: SqlDatabase): Record<string, Row[]> {
  const db = drizzle_of(database);
  return {
    books: db.select().from(books_books).all(),
    reads: db.select().from(books_reads).all(),
    journal: db.select().from(books_journal).all(),
    collections: db.select().from(books_collections).all(),
    book_collections: db.select().from(books_book_collections).all(),
    follows: db.select().from(books_follows).all(),
    goals: db.select().from(books_goals).all(),
  };
}

export function export_books_json(database: SqlDatabase): TransferFile {
  return transfer_file("books", tables, books_rows(database));
}

export function export_books_csv(database: SqlDatabase): Record<string, string> {
  return transfer_csv(tables, books_rows(database));
}

// ── Import ───────────────────────────────────────────────────────────────────

function parse_json(text: unknown, fallback: unknown): unknown {
  try {
    return typeof text === "string" && text ? JSON.parse(text) : fallback;
  } catch {
    return fallback;
  }
}

// An id the file gives a book is kept only while no other book here has it.
function free_ids(database: SqlDatabase, row: Row, own_id: string): Row {
  const db = drizzle_of(database);
  const kept = { ...row };
  for (const column of id_columns) {
    const value = kept[column];
    if (typeof value === "string" && value && db.select({ id: books_books.id }).from(books_books).where(eq(books_books[column], value)).all().some((other) => other.id !== own_id)) delete kept[column];
  }
  return kept;
}

// A value the page would not take, such as an unknown status, is left out.
function known_values(values: Row): Row {
  const known = { ...values };
  if (known.status !== undefined && !is_book_status(known.status)) delete known.status;
  if (known.format !== undefined && known.format !== "" && !is_book_format(known.format)) delete known.format;
  if (known.progress_unit !== undefined && !is_progress_unit(known.progress_unit)) delete known.progress_unit;
  if (typeof known.owned === "number") known.owned = known.owned ? 1 : 0;
  if (known.other_ids !== undefined) known.other_ids = JSON.stringify(clean_other_ids(known.other_ids));
  return known;
}

// The file's book as the page holds a tracked one, with its authors and series as lists and owned as yes or no.
function page_values(values: Row): Row {
  const shaped = { ...values };
  if ("author_refs" in shaped) shaped.author_refs = parse_json(shaped.author_refs, []);
  if ("series_ref" in shaped) shaped.series_ref = parse_json(shaped.series_ref, null);
  if ("owned" in shaped) shaped.owned = shaped.owned === 1;
  return shaped;
}

// New books are added whole; one already here, found by any id or by its title and first author, gains its reads,
// journal and collections and what it lacks, and comes back as a conflict when the file says otherwise of what the user keeps.
export function import_books_file(database: SqlDatabase, input: TransferInput): TransferReport {
  const read = read_transfer("books", tables, input);
  const report: TransferReport = { added: 0, updated: 0, unchanged: 0, conflicts: [] };
  const db = drizzle_of(database);

  in_transaction(database, () => {
    const collection_ids = new Map<string, string>();
    for (const collection of read.collections!) {
      const name = String(collection.name ?? "").trim();
      if (!name) continue;
      let id = db.select().from(books_collections).all().find((row) => row.name.toLowerCase() === name.toLowerCase())?.id ?? "";
      if (!id) db.insert(books_collections).values({ id: (id = new_id()), name }).run();
      collection_ids.set(String(collection.id ?? ""), id);
    }

    const book_ids = new Map<string, string>();
    const touched = new Set<string>();
    const added_ids = new Set<string>();
    const conflicts: ImportConflict[] = [];
    read.books!.forEach((book, index) => {
      const title = String(book.title ?? "").trim();
      if (!title) throw new Error(`Book ${index + 1} has no title.`);
      const { id: file_value, ...rest } = book;
      const file_id = String(file_value ?? "");
      const values = known_values(rest);
      const ids = { ...Object.fromEntries(id_columns.map((column) => [column, String(values[column] ?? "")])), other_ids: clean_other_ids(values.other_ids) };
      const existing =
        find_book(database, ids) || (file_id ? (db.select({ id: books_books.id }).from(books_books).where(eq(books_books.id, file_id)).get()?.id ?? "") : "") || find_by_title(database, title, String(values.authors ?? ""));
      if (!existing) {
        const id = book_key(ids) || file_id || new_id();
        db.insert(books_books)
          .values({ ...(values as typeof books_books.$inferInsert), id, title })
          .run();
        book_ids.set(file_id, id);
        added_ids.add(id);
        report.added += 1;
        return;
      }
      book_ids.set(file_id, existing);
      const tracked = db.select().from(books_books).where(eq(books_books.id, existing)).get()!;
      const incoming = free_ids(database, values, existing);
      const { fill, conflict } = meet_row(tracked, incoming, own_columns);
      if (Object.keys(fill).length > 0) {
        db.update(books_books).set(fill).where(eq(books_books.id, existing)).run();
        touched.add(existing);
      }
      if (conflict) conflicts.push({ id: existing, name: tracked.title, values: page_values({ ...incoming, title }) });
    });

    for (const entry of read.reads!) {
      const book_id = book_ids.get(String(entry.book_id ?? ""));
      if (!book_id) continue;
      const started_on = String(entry.started_on ?? "");
      const finished_on = String(entry.finished_on ?? "");
      const same = db
        .select({ id: books_reads.id })
        .from(books_reads)
        .where(and(eq(books_reads.book_id, book_id), eq(books_reads.started_on, started_on), eq(books_reads.finished_on, finished_on)))
        .get();
      if (same || (entry.id && db.select({ id: books_reads.id }).from(books_reads).where(eq(books_reads.id, String(entry.id))).get())) continue;
      const format = String(entry.format ?? "");
      db.insert(books_reads)
        .values({ id: String(entry.id || new_id()), book_id, started_on, finished_on, format: is_book_format(format) ? format : "", dnf: entry.dnf ? 1 : 0 })
        .run();
      touched.add(book_id);
    }

    for (const entry of read.journal!) {
      const book_id = book_ids.get(String(entry.book_id ?? ""));
      const text = String(entry.text ?? "");
      const written_on = String(entry.written_on ?? "");
      if (!book_id || !text || !written_on) continue;
      const same = db
        .select({ id: books_journal.id })
        .from(books_journal)
        .where(and(eq(books_journal.book_id, book_id), eq(books_journal.written_on, written_on), eq(books_journal.text, text)))
        .get();
      if (same || (entry.id && db.select({ id: books_journal.id }).from(books_journal).where(eq(books_journal.id, String(entry.id))).get())) continue;
      db.insert(books_journal)
        .values({ id: String(entry.id || new_id()), book_id, written_on, page: typeof entry.page === "number" ? entry.page : null, text })
        .run();
      touched.add(book_id);
    }

    for (const link of read.book_collections!) {
      const book_id = book_ids.get(String(link.book_id ?? ""));
      const collection_id = collection_ids.get(String(link.collection_id ?? ""));
      if (!book_id || !collection_id) continue;
      if (Number(db.insert(books_book_collections).values({ book_id, collection_id }).onConflictDoNothing().run().changes) > 0) touched.add(book_id);
    }

    // A follow arrives unchecked, so its first check fills Upcoming without an alert for each book already out.
    for (const follow of read.follows!) {
      const name = String(follow.name ?? "").trim();
      if (!follow.id || !name || (follow.kind !== "author" && follow.kind !== "series")) continue;
      db.insert(books_follows)
        .values({
          id: String(follow.id),
          kind: follow.kind,
          name,
          bookbrainz_id: String(follow.bookbrainz_id ?? ""),
          openlibrary_id: String(follow.openlibrary_id ?? ""),
          hardcover_id: String(follow.hardcover_id ?? ""),
          followed_at: String(follow.followed_at ?? ""),
        })
        .onConflictDoNothing()
        .run();
    }

    for (const goal of read.goals!) {
      if (!/^\d{4}$/.test(String(goal.year ?? "")) || typeof goal.target !== "number" || goal.target <= 0) continue;
      db.insert(books_goals).values({ year: String(goal.year), target: goal.target }).onConflictDoNothing().run();
    }

    for (const id of touched) settle_last_read(database, id);
    for (const id of added_ids) settle_last_read(database, id);
    report.conflicts = conflicts;
    report.updated = [...touched].filter((id) => !added_ids.has(id)).length;
  });
  report.unchanged = read.books!.length - report.added - report.updated;
  return report;
}
