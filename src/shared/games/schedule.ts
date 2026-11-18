// Imports the Steam library and wishlist on the schedule set in Settings, checked hourly, the first three minutes after
// start, wherever a database runs for long: the server and the desktop app. A phone, which the system may close at any
// moment, leaves it to them.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { MediaMethods } from "../store.ts";

// ── Schedule ─────────────────────────────────────────────────────────────────

const first_check_in_milliseconds = 3 * 60 * 1000;
const check_every_in_milliseconds = 60 * 60 * 1000;

// Returns the function that stops checking; on_ran is told only when an import ran.
export function keep_syncing_steam(methods: () => MediaMethods, on_ran: () => void): () => void {
  const check = (): void => {
    void Promise.resolve(methods().run_steam_sync(false))
      .then((ran) => {
        if (ran) on_ran();
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
