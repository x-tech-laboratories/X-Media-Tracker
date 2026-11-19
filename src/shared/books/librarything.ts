// LibraryThing has no API for a library, so books travel through files: its tab-separated or CSV export is read here,
// and the Goodreads library CSV written for StoryGraph is what LibraryThing's Goodreads import reads back.

// ── Imports ──────────────────────────────────────────────────────────────────

import { csv_records, tsv_records } from "@x-tech-laboratories/x-libs/csv";

import { clean_isbn, type BookFormat, type BookStatus } from "./model.ts";
import { column, day_of, rating_of, type ImportedBook, type ImportedRead } from "./storygraph.ts";

// ── Reading ──────────────────────────────────────────────────────────────────

// LibraryThing's own collections, which say a book's status and whether it is owned rather than becoming collections.
const own_collections = ["your library", "wishlist", "currently reading", "to read", "read but unowned"];

// "Cortazar, Julio" as "Julio Cortazar"; a name with no comma is kept.
function first_last(name: string): string {
  const [last = "", ...rest] = name.split(",").map((part) => part.trim());
  return rest.length ? `${rest.join(" ")} ${last}` : last;
}

// "[2007-05-08]" or several such as "2007-05-08, 2010-01-02" as days, empty ones dropped.
function days_of(value: string): string[] {
  return value
    .split(",")
    .map((day) => day_of(day.replace(/[[\]]/g, "")))
    .filter(Boolean);
}

// Media such as "Paperback", "Book > Hardcover", "Ebook" or "Audiobook > CD".
function format_of(media: string): BookFormat {
  if (/audio/i.test(media)) return "audiobook";
  if (/e-?book|kindle|digital|epub/i.test(media)) return "ebook";
  if (/book|paper|hardcover|hardback|broch|mass market/i.test(media)) return "print";
  return "";
}

// The ISBN-13 when the ISBNs column lists one, else the lone ISBN, its brackets stripped.
function isbn_of(record: Record<string, string>): string {
  const isbns = column(record, "ISBNs").split(/[,\s]+/).map(clean_isbn).filter(Boolean);
  return isbns.find((isbn) => isbn.length === 13) ?? isbns[0] ?? clean_isbn(column(record, "ISBN").replace(/[[\]]/g, ""));
}

// Each finish paired with the start at the same place; a start left over is a read still going.
function reads_of(started: string[], finished: string[]): ImportedRead[] {
  return Array.from({ length: Math.max(started.length, finished.length) }, (_, index) => ({ started_on: started[index] ?? "", finished_on: finished[index] ?? "", dnf: false }));
}

function status_of(collections: string[], started: string[], finished: string[]): BookStatus {
  if (collections.includes("currently reading") || started.length > finished.length) return "reading";
  if (finished.length || collections.includes("read but unowned")) return "read";
  return "want_to_read";
}

export function read_librarything_export(text: string): ImportedBook[] {
  const first_line = text.split(/\r?\n/, 1)[0] ?? "";
  const records = first_line.includes("\t") ? tsv_records(text) : csv_records(text);
  const columns = Object.keys(records[0] ?? {}).map((name) => name.toLowerCase());
  if (records.length && !(columns.includes("title") && columns.some((name) => name === "primary author" || name.startsWith("author")))) {
    throw new Error("That file doesn't look like a LibraryThing export; it needs Title and Primary Author columns.");
  }
  return records
    .filter((record) => column(record, "Title"))
    .map((record) => {
      const collection_names = column(record, "Collections")
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean);
      const collections = collection_names.map((name) => name.toLowerCase());
      const started = days_of(column(record, "Date Started"));
      const finished = days_of(column(record, "Date Read"));
      return {
        title: column(record, "Title"),
        authors: column(record, "Author (First, Last)") || first_last(column(record, "Primary Author", "Author (Last, First)", "Author")),
        isbn: isbn_of(record),
        format: format_of(column(record, "Media", "Binding")),
        status: status_of(collections, started, finished),
        added_at: days_of(column(record, "Entry Date", "Acquired"))[0] ?? "",
        last_read: [...finished].sort().at(-1) ?? "",
        reads: reads_of(started, finished),
        rating: rating_of(column(record, "Rating")),
        review: column(record, "Review"),
        moods: "",
        pace: "",
        tags: [
          ...collection_names.filter((name) => !own_collections.includes(name.toLowerCase())),
          ...column(record, "Tags")
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
        ],
        // An export from before collections lists only books owned.
        owned: collections.length === 0 ? !columns.includes("collections") : collections.includes("your library"),
      };
    });
}
