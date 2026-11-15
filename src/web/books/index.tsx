// The Books section: the Books library, a book's page, the results of the top bar's search, Upcoming for the authors
// and series followed, and Goals & stats.

// ── Imports ──────────────────────────────────────────────────────────────────

import "./books.css";

import { BookView } from "./BookView.tsx";
import { BooksLibrary } from "./BooksLibrary.tsx";
import { BookSearchView } from "./BookSearch.tsx";
import { GoalsView } from "./GoalsView.tsx";
import { UpcomingView } from "./UpcomingView.tsx";

export { book_settings } from "./BookSettings.tsx";
export { BookSearchBar } from "./BookSearch.tsx";

// ── Pages ────────────────────────────────────────────────────────────────────

export const books_pages = [
  { id: "library", label: "Library" },
  { id: "upcoming", label: "Upcoming" },
  { id: "goals", label: "Goals & stats" },
];

// #/books/book/<id> is a book's page and #/books/search/<words> the search's results, which the sidebar does not list.
export function BooksView({ parts }: { parts: string[] }) {
  const [page, id] = parts;
  if (page === "book" && id) return <BookView key={id} id={decodeURIComponent(id)} />;
  if (page === "search" && id) return <BookSearchView key={id} query={decodeURIComponent(id)} />;
  if (page === "upcoming") return <UpcomingView />;
  if (page === "goals") return <GoalsView />;
  return <BooksLibrary />;
}
