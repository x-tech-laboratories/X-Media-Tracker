// The books' calls described for other programs: what each does and the arguments it takes.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { JsonSchema, MethodSpec } from "@x-tech-laboratories/x-libs/api_spec";

import { day, id_of, json_file, text, transfer_input } from "../api_schemas.ts";
import { book_formats, book_statuses, progress_units } from "./model.ts";

// ── Shapes ───────────────────────────────────────────────────────────────────

const book_id: JsonSchema = { ...id_of("book"), description: 'The book\'s id, such as "bookbrainz:797946a0-32b3-43fb-b58d-cd12343a9c07" or "openlibrary:OL5738148W", as list_books gives it.' };

const format: JsonSchema = { type: "string", enum: [...book_formats], description: 'print, ebook or audiobook, or "" when not said.' };

const kind: JsonSchema = { type: "string", enum: ["author", "series"], description: "An author or a series." };

const ref: JsonSchema = {
  type: "object",
  description: "An author or series as search_book_people gives it: its name and any catalogue ids known.",
  properties: {
    name: text("Such as Brandon Sanderson or The Stormlight Archive."),
    bookbrainz_id: text("Its BookBrainz id, or empty."),
    openlibrary_id: text("Its Open Library id, such as OL1394865A, or empty."),
    hardcover_id: text("Its Hardcover id, or empty."),
  },
  required: ["name"],
};

const ids: JsonSchema = { type: "array", items: { type: "string" }, description: "Release ids from list_releases." };

// ── Calls ────────────────────────────────────────────────────────────────────

export const books_api = {
  list_books: {
    description:
      "Lists every tracked book, sorted by title, with its catalogue ids (BookBrainz, Open Library, Hardcover, ISBN), authors, series and place in it, " +
      "status (want_to_read, reading, paused, read or dnf), rating 1 to 10 (half stars out of five) or null, review, format, whether owned, progress, " +
      "every read with its start and finish days, and the collections it is in; then every book collection.",
    params: [],
  },
  get_book: {
    description: "Gives one tracked book as list_books does, or null when there is none with that id.",
    params: [{ name: "id", schema: book_id }],
  },
  search_books: {
    description:
      "Searches Open Library, BookBrainz and, when a key is set, Hardcover for books by title, author or ISBN at once, the same book from several " +
      "catalogues joined into one result, each marked with the id of the library's book when already tracked. Names any catalogue that failed.",
    params: [{ name: "query", schema: text("Words of the title or author, or an ISBN, such as The Final Empire.") }],
  },
  lookup_book_series: {
    description: "Looks up the series a tracked book is in: every book in it in order, from Hardcover when a key is set, else BookBrainz, else the library's own books in that series; null when it is in none.",
    params: [{ name: "id", schema: book_id }],
  },
  list_book_journal: {
    description: "Lists a book's reading journal, newest first: each entry's day, the page it is about or null, and its text.",
    params: [{ name: "book_id", schema: book_id }],
  },
  add_book: {
    description: "Adds a book from a catalogue by its id there, or by ISBN, filling in what every catalogue says of it, with the default status from Settings; one already tracked only has its details refreshed. Gives back its id.",
    params: [
      { name: "source", schema: { type: "string", description: "Which catalogue the id is from: bookbrainz, openlibrary or hardcover, the source a catalogue from the plugins folder names itself by, or isbn." } },
      { name: "id", schema: text("The id there, such as OL5738148W for Open Library (an edition such as OL7353617M finds its work), a BookBrainz work's id, a Hardcover book's number, or an ISBN.") },
    ],
  },
  add_book_from_link: {
    description: "Adds a book from a BookBrainz work, Open Library work or Hardcover book link, or a bare ISBN. Gives back its id.",
    params: [{ name: "link", schema: text("Such as https://openlibrary.org/works/OL5738148W, https://hardcover.app/books/the-final-empire or 9780765311788.") }],
  },
  set_book_ids: {
    description:
      "Sets a tracked book's catalogue ids, so a book the catalogues did not match can be pointed at the right one; then fetches its details from them again. " +
      "An id left out stays as it is and an empty one is cleared; an Open Library edition is turned into its work, and an id another tracked book already has is refused. " +
      "The book keeps its own id, status, rating, reads and journal. Gives back the book.",
    params: [
      { name: "id", schema: book_id },
      {
        name: "ids",
        schema: {
          type: "object",
          properties: {
            bookbrainz_id: text("A BookBrainz work's id or link, or empty to clear it."),
            openlibrary_id: text("An Open Library work or edition, such as OL5738148W or OL7353617M, or a link to either; empty clears it."),
            hardcover_id: text("A Hardcover book's number, or empty to clear it."),
            isbn: text("An ISBN-13 or ISBN-10, or empty to clear it."),
          },
        },
      },
    ],
  },
  lookup_book_sources: {
    description:
      "Looks up what each catalogue (BookBrainz, Open Library and, when a key is set, Hardcover) says of a tracked book, each answer on its own rather than joined, " +
      "with the same field names as list_books gives a book: ids, title, subtitle, authors, series, year, release_date, overview, cover_url, genres, pages and audio_minutes. " +
      "Names any catalogue that failed. Use it to pick, field by field, which catalogue's value a book keeps through merge_books.",
    params: [{ name: "id", schema: book_id }],
  },
  merge_books: {
    description:
      "Merges tracked books that are the same book into one: the book kept takes the values given, gains every read, journal entry and collection of the others, " +
      "and the others are removed; History can bring them back. Values are by list_books' field names, such as title, authors, author_refs, series_ref, status, " +
      "rating or owned, each from one of the books or from lookup_book_sources; a field left out stays as the kept book has it. A catalogue id another tracked book " +
      "outside the merge already has is refused. With one id it only sets the values. Gives back the book kept.",
    params: [
      { name: "ids", schema: { type: "array", items: { type: "string" }, description: "Every book to merge, the kept one among them, by its id as list_books gives it." } },
      { name: "keep", schema: { ...book_id, description: "The id of the book that stays." } },
      { name: "values", schema: { type: "object", description: 'The fields the kept book takes, by name, such as {"title": "The Final Empire", "rating": 9}.' } },
    ],
  },
  remove_book: {
    description: "Removes a book from the library, with its reads and journal; History can bring it back.",
    params: [{ name: "id", schema: book_id }],
  },
  set_book_status: {
    description: "Sets a book's status. reading opens a read starting today; read and dnf close the open read today, or add one ending today; read also clears the progress.",
    params: [
      { name: "id", schema: book_id },
      { name: "status", schema: { type: "string", enum: [...book_statuses], description: "The new status." } },
    ],
  },
  set_book_rating: {
    description: "Rates a book 1 to 10, shown as half stars out of five, or clears its rating with null or 0.",
    params: [
      { name: "id", schema: book_id },
      { name: "rating", schema: { type: ["number", "null"], minimum: 0, maximum: 10, description: "1 to 10, or null for none." } },
    ],
  },
  set_book_notes: {
    description: "Sets your own notes on a book, in Markdown, replacing any before; empty clears them. Notes are kept apart from any review.",
    params: [
      { name: "id", schema: book_id },
      { name: "notes", schema: text("The notes' text, in Markdown.") },
    ],
  },
  set_book_review: {
    description: "Sets a book's review, replacing any before; empty clears it.",
    params: [
      { name: "id", schema: book_id },
      { name: "review", schema: text("The review's text, in Markdown.") },
    ],
  },
  set_book_owned: {
    description: "Marks whether a copy of the book is owned.",
    params: [
      { name: "id", schema: book_id },
      { name: "owned", schema: { type: "boolean", description: "True when owned." } },
    ],
  },
  set_book_format: {
    description: "Sets the format a book is read in.",
    params: [
      { name: "id", schema: book_id },
      { name: "format", schema: format },
    ],
  },
  set_book_progress: {
    description: "Sets how far into its current read a book is, in pages, percent or audiobook minutes; progress on a book not yet started starts it. Gives back the book.",
    params: [
      { name: "id", schema: book_id },
      { name: "progress", schema: { type: "number", minimum: 0, description: "The page, percent (0 to 100) or minute reached." } },
      { name: "unit", schema: { type: "string", enum: [...progress_units], description: "What progress counts." } },
    ],
  },
  save_book_read: {
    description: "Adds one time through a book, or changes the one with the id given; a read with no finish day is the one in progress. Gives back its id.",
    params: [
      { name: "book_id", schema: book_id },
      {
        name: "read",
        schema: {
          type: "object",
          properties: {
            id: text("The read's id when changing it; leave out to add one."),
            started_on: { ...day, description: "The day it started, such as 2026-11-01, or empty." },
            finished_on: { ...day, description: "The day it finished or was given up, or empty while reading." },
            format,
            dnf: { type: "boolean", description: "True when it was given up rather than finished." },
          },
          required: ["started_on", "finished_on", "format", "dnf"],
        },
      },
    ],
  },
  remove_book_read: {
    description: "Removes one read of a book.",
    params: [{ name: "id", schema: id_of("read") }],
  },
  save_journal_entry: {
    description: "Adds a dated note to a book's reading journal, or changes the one with the id given. Gives back its id.",
    params: [
      { name: "book_id", schema: book_id },
      {
        name: "entry",
        schema: {
          type: "object",
          properties: {
            id: text("The entry's id when changing it; leave out to add one."),
            written_on: { ...day, description: "The day, such as 2026-11-10; empty means today." },
            page: { type: ["integer", "null"], minimum: 1, description: "The page it is about, or null." },
            text: text("The note, in Markdown."),
          },
          required: ["written_on", "page", "text"],
        },
      },
    ],
  },
  remove_journal_entry: {
    description: "Removes one entry from a book's reading journal.",
    params: [{ name: "id", schema: id_of("journal entry") }],
  },
  set_book_collections: {
    description: "Sets which collections a book is in, replacing the ones it was in.",
    params: [
      { name: "id", schema: book_id },
      { name: "collection_ids", schema: { type: "array", items: { type: "string" }, description: "Book collection ids from list_books." } },
    ],
  },
  save_book_collection: {
    description: "Adds a book collection, or renames the one with the id given; a name already in use, whatever its case, merges into that one. Gives back its id.",
    params: [{ name: "collection", schema: { type: "object", properties: { id: text("The collection's id when renaming it; leave out to add one."), name: text("Such as Book club.") }, required: ["name"] } }],
  },
  remove_book_collection: {
    description: "Removes a book collection; its books stay in the library.",
    params: [{ name: "id", schema: id_of("book collection") }],
  },
  search_book_people: {
    description: "Searches BookBrainz, Open Library and, when a key is set, Hardcover for authors or series to follow, one row per name with every catalogue's id.",
    params: [
      { name: "query", schema: text("Words of the name, such as Sanderson.") },
      { name: "kind", schema: kind },
    ],
  },
  list_follows: {
    description: "Lists the authors and series followed for new books, with their catalogue ids and when each was followed.",
    params: [],
  },
  follow_book_people: {
    description: "Follows an author or series for new books, looking its name up in the other catalogues too. Authors are watched on Open Library and Hardcover, series on Hardcover. Gives back the follow's id.",
    params: [
      { name: "kind", schema: kind },
      { name: "ref", schema: ref },
    ],
  },
  unfollow_book_people: {
    description: "Stops following an author or series, dropping the new books found for it.",
    params: [{ name: "id", schema: id_of("follow") }],
  },
  list_releases: {
    description: "Lists the books found for the authors and series followed, by release day: title, authors, series, the day it is or was out, whether it has been seen and when an alert went out.",
    params: [],
  },
  run_release_check: {
    description:
      "Checks every author and series followed for books out in the last 30 days or announced, when the hours set under Settings have passed since the last check, or at once when forced. " +
      "Gives how many new books it found and which follows failed, or null when no check was due. Books found the first time a follow is checked fill the list without an alert.",
    params: [{ name: "force", schema: { type: "boolean", description: "True to check now whatever the schedule." } }],
  },
  mark_releases_seen: {
    description: "Marks found books as seen, so they no longer show as new; an empty list marks them all.",
    params: [{ name: "ids", schema: ids }],
  },
  list_unnotified_releases: {
    description: "Lists the found books no alert has gone out for yet.",
    params: [],
  },
  mark_releases_notified: {
    description: "Records that an alert went out for these found books.",
    params: [{ name: "ids", schema: ids }],
  },
  get_reading_year: {
    description: "Gives one year's reading: the goal set, books finished and given up, pages and audiobook minutes, books and pages by month, ratings, formats and the top genres.",
    params: [{ name: "year", schema: { type: "integer", description: "Such as 2026." } }],
  },
  set_reading_goal: {
    description: "Sets how many books to finish in a year, or clears the goal with null or 0.",
    params: [
      { name: "year", schema: { type: "integer", description: "Such as 2026." } },
      { name: "target", schema: { type: ["integer", "null"], minimum: 0, description: "Books to finish, or null for no goal." } },
    ],
  },
  import_storygraph: {
    description: "Imports StoryGraph's library export CSV: status, reads with their days, rating, review, format, owned, moods, pace and tags as collections. Adds new books and merges ones already here by ISBN or title, never removing any.",
    params: [{ name: "csv", schema: { ...json_file, description: "The export CSV's whole text." } }],
  },
  import_librarything: {
    description: "Imports LibraryThing's library export, tab-separated or CSV: reads with their start and finish days, rating, review, format, owned (the Your library collection), status from the Currently reading, To read and Wishlist collections, and other collections and tags as collections. Adds new books and merges ones already here by ISBN or title, never removing any.",
    params: [{ name: "text", schema: { ...json_file, description: "The export file's whole text." } }],
  },
  export_storygraph: {
    description: "Gives the library as a Goodreads library export CSV, which StoryGraph's, LibraryThing's and Hardcover's importers read.",
    params: [],
  },
  export_books_json: {
    description:
      "Gives Books whole as an X-Media-Tracker export: every book with its status, rating, review, notes, progress and ids, every read and journal entry, the collections, the authors and series followed " +
      "and the reading goals, each as a list of rows under tables. import_books_file reads it back.",
    params: [],
  },
  export_books_csv: {
    description: "Gives Books as one CSV file per table, by file name: books.csv, reads.csv, journal.csv, collections.csv, book_collections.csv, follows.csv and goals.csv, the same rows export_books_json gives.",
    params: [],
  },
  import_books_file: {
    description:
      "Imports a Books export, JSON or CSV, never removing anything: new books are added whole; a book already here, found by any id or by its title and first author, gains its reads, journal entries, " +
      "collections and whatever it lacks; follows and goals not here are added. Answers how many books were added, updated and unchanged, and lists as conflicts the books whose status, rating, " +
      "review, notes, owned, format, progress, moods or pace the file says otherwise, with the file's values, to settle through merge_books with the book's own id.",
    params: [{ name: "input", schema: transfer_input }],
  },
  refresh_books: {
    description: "Starts fetching every book's details from the catalogues again in the background, finding books known only by title on Open Library; never changes a status, rating or read. Answers at once with its progress; follow it with get_books_refresh.",
    params: [],
  },
  get_books_refresh: {
    description: "Shows the latest books refresh: running, done or failed, how far it has got, and once done how many books were updated or not found. State none means no refresh since the server started.",
    params: [],
  },
} satisfies Record<string, MethodSpec>;
