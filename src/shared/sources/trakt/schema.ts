// The Trakt plugin's table, from which drizzle-kit writes the migrations: Trakt's own answers, kept untouched.

// ── Imports ──────────────────────────────────────────────────────────────────

import { sqliteTable, text } from "@x-tech-laboratories/x-libs/drizzle";

// ── Tables ───────────────────────────────────────────────────────────────────

// Everything Trakt held at one moment, as Trakt sent it, so nothing is lost to a gap in what the library reads of it.
export const trakt_archives = sqliteTable("trakt_archives", {
  id: text().primaryKey(),
  fetched_at: text().notNull(),
  // How many rows each list held, by its name; null for a list that failed.
  counts: text().notNull(),
  failures: text().notNull(),
  data: text().notNull(),
});

export const trakt_tables = [trakt_archives];
