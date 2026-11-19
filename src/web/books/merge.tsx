// What the merge window compares of a book, and how it reads each field.

// ── Imports ──────────────────────────────────────────────────────────────────

import { calls } from "../api.ts";
import { combine_lists, type MergeFieldSpec, type MergeKind } from "../merging.tsx";
import { title_words } from "../../shared/books/catalog.ts";
import { book_format_labels, book_status_labels, format_minutes, is_book_format, is_book_status, type LibraryBook } from "../../shared/books/model.ts";
import { book_href, stars_text } from "./actions.tsx";

// ── Fields ───────────────────────────────────────────────────────────────────

// A number of nothing reads as empty, so a catalogue that left it out does not look like a value.
const count_text = (value: unknown) => (typeof value === "number" && value ? String(value) : "");

const fields: MergeFieldSpec[] = [
  { id: "title", label: "Title", columns: ["title"] },
  { id: "subtitle", label: "Subtitle", columns: ["subtitle"] },
  { id: "authors", label: "Authors", columns: ["authors", "author_refs"] },
  { id: "series", label: "Series", columns: ["series", "series_ref"] },
  { id: "series_position", label: "Place in series", columns: ["series_position"] },
  { id: "year", label: "Year", columns: ["year"] },
  { id: "release_date", label: "Released", columns: ["release_date"] },
  { id: "overview", label: "Overview", columns: ["overview"] },
  { id: "cover", label: "Cover", columns: ["cover_url", "cover_file", "cover_file_from"] },
  { id: "genres", label: "Genres", columns: ["genres"], combine: combine_lists },
  { id: "pages", label: "Pages", columns: ["pages"], text: count_text },
  { id: "audio_minutes", label: "Audio length", columns: ["audio_minutes"], text: (value) => (typeof value === "number" && value ? format_minutes(value) : "") },
  { id: "bookbrainz_id", label: "BookBrainz", columns: ["bookbrainz_id"] },
  { id: "openlibrary_id", label: "Open Library", columns: ["openlibrary_id"] },
  { id: "hardcover_id", label: "Hardcover", columns: ["hardcover_id"] },
  { id: "isbn", label: "ISBN", columns: ["isbn"] },
  { id: "status", label: "Status", columns: ["status"], personal: true, text: (value) => (is_book_status(value) ? book_status_labels[value] : "") },
  { id: "rating", label: "Rating", columns: ["rating"], personal: true, text: (value) => stars_text(value as number | null) },
  { id: "review", label: "Review", columns: ["review"], personal: true },
  { id: "notes", label: "Notes", columns: ["notes"], personal: true },
  { id: "format", label: "Format", columns: ["format"], personal: true, text: (value) => (is_book_format(value) && value ? book_format_labels[value] : "") },
  { id: "owned", label: "Owned", columns: ["owned"], personal: true, text: (value) => (value ? "Owned" : "Not owned") },
  { id: "progress", label: "Progress", columns: ["progress", "progress_unit"], personal: true, text: count_text },
  { id: "moods", label: "Moods", columns: ["moods"], personal: true, combine: combine_lists },
  { id: "pace", label: "Pace", columns: ["pace"], personal: true },
  { id: "added_at", label: "Added", columns: ["added_at"], personal: true },
];

// ── Kind ─────────────────────────────────────────────────────────────────────

export const book_merge: MergeKind<LibraryBook> = {
  noun: "book",
  name: (book) => book.title,
  detail: (book) => [book.authors, book.year].filter(Boolean).join(" · "),
  cover: (values) => ({ file: String(values.cover_file ?? ""), address: String(values.cover_url ?? "") }),
  fields,
  alike: (first, second) => title_words(first.title) === title_words(second.title),
  lookup_sources: (id) => calls().lookup_book_sources(id),
  merge: (ids, keep, values) => calls().merge_books(ids, keep, values),
  href: book_href,
};
