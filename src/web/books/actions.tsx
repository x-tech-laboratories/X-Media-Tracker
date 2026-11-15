// Where books' pages live, and setting a book's status from anywhere with the menu items that do it.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { MenuItem } from "@x-tech-laboratories/x-libs/web/react/menus";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";

import { calls } from "../api.ts";
import { book_status_labels, book_statuses, type BookStatus, type LibraryBook } from "../../shared/books/model.ts";
import type { AddedBook } from "../../shared/books/store.ts";

// ── Links ────────────────────────────────────────────────────────────────────

export function book_href(id: string): string {
  return `#/books/book/${encodeURIComponent(id)}`;
}

export function book_search_href(query: string): string {
  return `#/books/search/${encodeURIComponent(query)}`;
}

export function report_added(added: AddedBook): void {
  toast(added.existed ? `${added.title} was already tracked; its details are refreshed.` : `Added ${added.title}.`, { tone: "good", link: { href: book_href(added.id), text: "Open" } });
}

// Runs a change and says why it failed, if it did.
export function attempt(work: Promise<unknown>): void {
  work.catch((error: unknown) => toast((error as Error).message, { tone: "bad" }));
}

// ── Status ───────────────────────────────────────────────────────────────────

export function set_book_status(book: Pick<LibraryBook, "id">, status: BookStatus): void {
  attempt(calls().set_book_status(book.id, status));
}

export function book_status_menu_items(book: Pick<LibraryBook, "id" | "status">): MenuItem[] {
  return book_statuses.map((status) => ({ label: book_status_labels[status], radio: true, checked: book.status === status, run: () => set_book_status(book, status) }));
}

// ── Ratings ──────────────────────────────────────────────────────────────────

// A rating of 1 to 10 as the Movies library shows one, such as "★ 9".
export function stars_text(rating: number | null): string {
  return rating ? `★ ${rating}` : "";
}
