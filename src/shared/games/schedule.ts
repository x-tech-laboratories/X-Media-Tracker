// Reads the Steam client's categories hourly, the first three minutes after start, on the desktop app, where Steam's
// files are; a mapped category gives its games their status. The store imports run on the sources' one schedule.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { MediaMethods } from "../store.ts";

// ── Schedule ─────────────────────────────────────────────────────────────────

const first_check_in_milliseconds = 3 * 60 * 1000;
const check_every_in_milliseconds = 60 * 60 * 1000;

// Returns the function that stops reading; on_ran is told only when a category changed a game.
export function keep_reading_steam_categories(methods: () => MediaMethods, on_ran: () => void, read_categories: () => string): () => void {
  const check = (): void => {
    try {
      const raw = read_categories();
      if (raw && methods().import_steam_categories(raw).updated > 0) on_ran();
    } catch (error) {
      console.warn("steam categories:", error);
    }
  };
  const first = setTimeout(check, first_check_in_milliseconds);
  const every = setInterval(check, check_every_in_milliseconds);
  return () => {
    clearTimeout(first);
    clearInterval(every);
  };
}
