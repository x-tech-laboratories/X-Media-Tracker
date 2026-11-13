// Checks the automatic imports hourly, the first a minute after start, wherever a database runs for long: the server
// and the desktop app. A phone, which the system may close at any moment, leaves it to them.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { MediaMethods } from "../store.ts";

// ── Schedule ─────────────────────────────────────────────────────────────────

const first_check_in_milliseconds = 60 * 1000;
const check_every_in_milliseconds = 60 * 60 * 1000;

// Returns the function that stops checking; on_ran is told only when imports actually ran.
export function keep_importing(methods: () => MediaMethods, on_ran: () => void): () => void {
  const check = (): void => {
    void Promise.resolve(methods().run_due_imports())
      .then((run) => {
        if (run) on_ran();
      })
      .catch((error: unknown) => console.warn("automatic imports:", error));
  };
  const first = setTimeout(check, first_check_in_milliseconds);
  const every = setInterval(check, check_every_in_milliseconds);
  return () => {
    clearTimeout(first);
    clearInterval(every);
  };
}
