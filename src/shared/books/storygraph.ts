// The StoryGraph has no API, so books travel through files: its own export CSV is read here, and the library is written
// as a Goodreads library export, which StoryGraph's importer (and Hardcover's) reads back.

// ── Imports ──────────────────────────────────────────────────────────────────

import { csv_records, write_csv } from "./csv.ts";
import { clean_isbn, type BookFormat, type BookStatus, type LibraryBook } from "./model.ts";

// ── Reading ──────────────────────────────────────────────────────────────────

export interface ImportedRead {
  started_on: string;
  finished_on: string;
  dnf: boolean;
}

export interface ImportedBook {
  title: string;
  authors: string;
  isbn: string;
  format: BookFormat;
  status: BookStatus;
  added_at: string;
  last_read: string;
  reads: ImportedRead[];
  // 1 to 10, or null.
  rating: number | null;
  review: string;
  moods: string;
  pace: string;
  tags: string[];
  owned: boolean;
}

const statuses: Record<string, BookStatus> = {
  read: "read",
  "currently-reading": "reading",
  "to-read": "want_to_read",
  "did-not-finish": "dnf",
  paused: "paused",
};

const formats: Record<string, BookFormat> = { paperback: "print", hardcover: "print", print: "print", digital: "ebook", ebook: "ebook", audio: "audiobook", audiobook: "audiobook" };

// "2023/01/05" or "2023-01-05" as 2023-01-05; anything else as "".
export function day_of(value: string): string {
  const match = /(\d{4})[/-](\d{1,2})[/-](\d{1,2})/.exec(value);
  return match ? `${match[1]}-${match[2]!.padStart(2, "0")}-${match[3]!.padStart(2, "0")}` : "";
}

// "2023/01/05-2023/01/20, 2024/02/01-2024/02/09", a lone day meaning the day finished.
function reads_of(value: string, dnf: boolean): ImportedRead[] {
  return value
    .split(",")
    .map((span) => span.trim())
    .filter(Boolean)
    .map((span) => {
      const [first = "", second] = span.split(/\s*-\s*(?=\d{4})/);
      return second === undefined ? { started_on: "", finished_on: day_of(first), dnf } : { started_on: day_of(first), finished_on: day_of(second), dnf };
    })
    .filter((read) => read.started_on || read.finished_on);
}

// Columns found by name whatever their case, since StoryGraph has renamed some over time.
export function column(record: Record<string, string>, ...names: string[]): string {
  for (const name of names) {
    const key = Object.keys(record).find((each) => each.toLowerCase() === name.toLowerCase());
    if (key !== undefined && record[key]!.trim()) return record[key]!.trim();
  }
  return "";
}

// Half stars out of five as 1 to 10; StoryGraph's quarter stars round to the nearest half.
export function rating_of(value: string): number | null {
  const stars = Number.parseFloat(value);
  if (!Number.isFinite(stars) || stars <= 0) return null;
  return Math.max(1, Math.min(10, Math.round(stars * 2)));
}

export function read_storygraph_csv(text: string): ImportedBook[] {
  const records = csv_records(text);
  const columns = Object.keys(records[0] ?? {}).map((name) => name.toLowerCase());
  if (records.length && !(columns.includes("title") && columns.includes("read status"))) {
    throw new Error("That file doesn't look like a StoryGraph export; it needs Title and Read Status columns.");
  }
  return records
    .filter((record) => column(record, "Title"))
    .map((record) => {
      const status = statuses[column(record, "Read Status").toLowerCase()] ?? "want_to_read";
      const last_read = day_of(column(record, "Last Date Read"));
      const reads = reads_of(column(record, "Dates Read"), status === "dnf");
      if (reads.length === 0 && last_read && (status === "read" || status === "dnf")) reads.push({ started_on: "", finished_on: last_read, dnf: status === "dnf" });
      return {
        title: column(record, "Title"),
        authors: column(record, "Authors", "Author"),
        isbn: clean_isbn(column(record, "ISBN/UID", "ISBN")),
        format: formats[column(record, "Format").toLowerCase()] ?? "",
        status,
        added_at: day_of(column(record, "Date Added")),
        last_read,
        reads,
        rating: rating_of(column(record, "Star Rating", "Rating")),
        review: column(record, "Review"),
        moods: column(record, "Moods"),
        pace: column(record, "Pace"),
        tags: column(record, "Tags")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        owned: /^(yes|true|1)$/i.test(column(record, "Owned?", "Owned")),
      };
    });
}

// ── Writing ──────────────────────────────────────────────────────────────────

const goodreads_header = [
  "Book Id",
  "Title",
  "Author",
  "Author l-f",
  "Additional Authors",
  "ISBN",
  "ISBN13",
  "My Rating",
  "Average Rating",
  "Publisher",
  "Binding",
  "Number of Pages",
  "Year Published",
  "Original Publication Year",
  "Date Read",
  "Date Added",
  "Bookshelves",
  "Bookshelves with positions",
  "Exclusive Shelf",
  "My Review",
  "Spoiler",
  "Private Notes",
  "Read Count",
  "Owned Copies",
];

const shelves: Record<BookStatus, string> = { want_to_read: "to-read", reading: "currently-reading", paused: "currently-reading", read: "read", dnf: "did-not-finish" };

const bindings: Record<BookFormat, string> = { "": "", print: "Paperback", ebook: "Kindle Edition", audiobook: "Audiobook" };

function slashed(day: string): string {
  return day.replace(/-/g, "/");
}

function last_first(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts.at(-1)}, ${parts.slice(0, -1).join(" ")}` : name;
}

// Goodreads writes ISBNs as ="…" so a spreadsheet keeps their leading zeros.
function isbn_cell(isbn: string): string {
  return isbn ? `="${isbn}"` : "";
}

export function write_goodreads_csv(books: LibraryBook[], collection_names: Map<string, string>): string {
  const rows = books.map((book, index) => {
    const [author = "", ...others] = book.authors.split(",").map((name) => name.trim()).filter(Boolean);
    const shelf = shelves[book.status];
    const collections = book.collection_ids.map((id) => collection_names.get(id)).filter((name): name is string => !!name);
    const finished = book.reads.filter((read) => read.finished_on && !read.dnf).length;
    return [
      index + 1,
      book.title,
      author,
      last_first(author),
      others.join(", "),
      isbn_cell(book.isbn.length === 10 ? book.isbn : ""),
      isbn_cell(book.isbn.length === 13 ? book.isbn : ""),
      book.rating ? Math.round(book.rating / 2) : 0,
      "",
      "",
      bindings[book.format],
      book.pages || "",
      book.year,
      book.year,
      slashed(book.last_read),
      slashed(book.added_at),
      [...collections, ...(shelf === "read" || shelf === "to-read" || shelf === "currently-reading" ? [] : [shelf])].join(", "),
      "",
      shelf,
      book.review,
      "",
      "",
      Math.max(finished, book.status === "read" ? 1 : 0),
      book.owned ? 1 : 0,
    ];
  });
  return write_csv(goodreads_header, rows);
}
