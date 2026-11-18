// Where games' pages live, and setting a game's status from anywhere with the menu items that do it.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { MenuItem } from "@x-tech-laboratories/x-libs/web/react/menus";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";

import { calls } from "../api.ts";
import { game_status_group_of, game_status_labels, game_statuses, type GameStatus, type LibraryGame } from "../../shared/games/model.ts";
import type { AddedGame } from "../../shared/games/store.ts";

// ── Links ────────────────────────────────────────────────────────────────────

export function game_href(id: string): string {
  return `#/games/game/${encodeURIComponent(id)}`;
}

export function game_search_href(query: string): string {
  return `#/games/search/${encodeURIComponent(query)}`;
}

export function report_added(added: AddedGame): void {
  toast(added.existed ? `${added.title} was already tracked; its details are refreshed.` : `Added ${added.title}.`, { tone: "good", link: { href: game_href(added.id), text: "Open" } });
}

// Runs a change and says why it failed, if it did.
export function attempt(work: Promise<unknown>): void {
  work.catch((error: unknown) => toast((error as Error).message, { tone: "bad" }));
}

// ── Status ───────────────────────────────────────────────────────────────────

export function set_game_status(game: Pick<LibraryGame, "id">, status: GameStatus): void {
  attempt(calls().set_game_status(game.id, status));
}

// Every status, a line between one group and the next.
export function game_status_menu_items(game: Pick<LibraryGame, "id" | "status">): MenuItem[] {
  return game_statuses.map((status, index) => ({
    label: game_status_labels[status],
    radio: true,
    checked: game.status === status,
    separator_before: index > 0 && game_status_group_of[status] !== game_status_group_of[game_statuses[index - 1]!],
    run: () => set_game_status(game, status),
  }));
}

// A rating of 1 to 10 as the other libraries show one, such as "★ 9".
export function stars_text(rating: number | null): string {
  return rating ? `★ ${rating}` : "";
}
