// Checks the authors and series followed for new books hourly, the first two minutes after start, wherever a database
// runs for long: the server and the desktop app. A phone, which the system may close at any moment, leaves it to them.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { MediaMethods } from "../store.ts";

// ── Schedule ─────────────────────────────────────────────────────────────────

const first_check_in_milliseconds = 2 * 60 * 1000;
const check_every_in_milliseconds = 60 * 60 * 1000;

// Returns the function that stops checking; on_ran is told only when a check ran, and after_check runs after every
// hourly turn, such as the server sending alerts for books another device found.
export function keep_checking_releases(methods: () => MediaMethods, on_ran: () => void, after_check: () => Promise<unknown> = async () => undefined): () => void {
  const check = (): void => {
    void Promise.resolve(methods().run_release_check(false))
      .then((ran) => {
        if (ran) on_ran();
      })
      .catch((error: unknown) => console.warn("new book check:", error))
      .then(after_check)
      .catch((error: unknown) => console.warn("new book alerts:", error));
  };
  const first = setTimeout(check, first_check_in_milliseconds);
  const every = setInterval(check, check_every_in_milliseconds);
  return () => {
    clearTimeout(first);
    clearInterval(every);
  };
}
