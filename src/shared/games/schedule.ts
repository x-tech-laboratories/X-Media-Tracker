// Imports the Steam library and wishlist on the schedule set in Settings, and on the desktop the Steam client's categories,
// checked hourly, the first three minutes after start, wherever a database runs for long: the server and the desktop
// app. A phone, which the system may close at any moment, leaves it to them.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { MediaMethods } from "../store.ts";

// ── Schedule ─────────────────────────────────────────────────────────────────

const first_check_in_milliseconds = 3 * 60 * 1000;
const check_every_in_milliseconds = 60 * 60 * 1000;

// Games in mapped Steam categories take their statuses on every check where read_categories finds the Steam client's file.
function import_categories(methods: () => MediaMethods, read_categories: () => string): boolean {
  const raw = read_categories();
  return !!raw && methods().import_steam_categories(raw).updated > 0;
}

// Returns the function that stops checking; on_ran is told only when an import ran or a category changed a game.
export function keep_syncing_steam(methods: () => MediaMethods, on_ran: () => void, read_categories?: () => string): () => void {
  const check = (): void => {
    void Promise.resolve(methods().run_steam_sync(false))
      .then((ran) => {
        const changed = read_categories ? import_categories(methods, read_categories) : false;
        if (ran || changed) on_ran();
      })
      .catch((error: unknown) => console.warn("steam import:", error));
  };
  const first = setTimeout(check, first_check_in_milliseconds);
  const every = setInterval(check, check_every_in_milliseconds);
  return () => {
    clearTimeout(first);
    clearInterval(every);
  };
}
