// Covers kept on every device: each game's and book's cover and each title's poster is downloaded whole into a synced
// file, so the library shows them offline. The address is only where a fresh image comes from; when it changes, as on a
// refresh, the image is taken again. A cover set by hand is marked "custom" and never replaced.

// ── Imports ──────────────────────────────────────────────────────────────────

import { eq, ne } from "@x-tech-laboratories/x-libs/drizzle";
import type { SqlDatabase } from "@x-tech-laboratories/x-libs/sql";
import { put_file, type SyncFileStore } from "@x-tech-laboratories/x-libs/sync_files";

import { books_books } from "./books/schema.ts";
import { drizzle_of } from "./feature.ts";
import { games_games } from "./games/schema.ts";
import { forget_synced_changes, record_history } from "./history/store.ts";
import { image_url } from "./library/model.ts";
import { library_titles } from "./library/schema.ts";
import { setting } from "./library/store.ts";

// ── Rows ─────────────────────────────────────────────────────────────────────

export const custom_cover = "custom";

const tables = [games_games, books_books, library_titles] as const;
type CoverTable = (typeof tables)[number];

// A row whose kept cover is not from its current address.
export interface StaleCover {
  table: CoverTable;
  id: string;
  address: string;
}

// The address each row's image comes from now, a TMDB poster at the saved size or the catalogue's cover, for one row or all.
function addresses_of(database: SqlDatabase, table: CoverTable, id?: string): { id: string; address: string; from: string }[] {
  const db = drizzle_of(database);
  if (table === library_titles) {
    const size = setting(database, "library.saved_poster_size");
    return db
      .select({ id: library_titles.id, path: library_titles.poster_path, from: library_titles.cover_file_from })
      .from(library_titles)
      .where(id === undefined ? undefined : eq(library_titles.id, id))
      .all()
      .map((row) => ({ id: row.id, address: image_url(row.path, size), from: row.from }));
  }
  // Books keep their cover in the same columns as games.
  const catalogue = table as typeof games_games;
  return db
    .select({ id: catalogue.id, address: catalogue.cover_url, from: catalogue.cover_file_from })
    .from(catalogue)
    .where(id === undefined ? undefined : eq(catalogue.id, id))
    .all();
}

function is_stale(row: { address: string; from: string }): boolean {
  return row.address !== "" && row.from !== row.address && row.from !== custom_cover;
}

// Every kept cover's file name, for the sync to send and fetch.
export function referenced_covers(database: SqlDatabase): string[] {
  const db = drizzle_of(database);
  return tables.flatMap((table) => db.select({ file: table.cover_file }).from(table).where(ne(table.cover_file, "")).all().map((row) => row.file));
}

export function stale_covers(database: SqlDatabase): StaleCover[] {
  return tables.flatMap((table) =>
    addresses_of(database, table)
      .filter(is_stale)
      .map((row) => ({ table, id: row.id, address: row.address })),
  );
}

// Keeps the file as the row's cover, unless the row moved on while it downloaded; the history leaves this out, since
// it only follows an address the user already saw change.
function keep_cover(database: SqlDatabase, cover: StaleCover, file: string): boolean {
  const [row] = addresses_of(database, cover.table, cover.id);
  if (!row || !is_stale(row) || row.address !== cover.address) return false;
  record_history(database);
  drizzle_of(database).update(cover.table).set({ cover_file: file, cover_file_from: cover.address }).where(eq(cover.table.id, cover.id)).run();
  forget_synced_changes(database);
  return true;
}

// ── Downloading ──────────────────────────────────────────────────────────────

const timeout_in_milliseconds = 30_000;
const downloads_at_once = 4;

// An image, or bytes sent without saying what they are, as some image hosts do.
function is_image_type(type: string): boolean {
  return !type || type.startsWith("image/") || type.startsWith("application/octet-stream");
}

async function download(fetcher: typeof fetch, address: string): Promise<Uint8Array> {
  const response = await fetcher(address, { signal: AbortSignal.timeout(timeout_in_milliseconds) });
  if (!response.ok) throw new Error(`${new URL(address).hostname} answered ${response.status}`);
  const type = response.headers.get("content-type") ?? "";
  if (!is_image_type(type)) throw new Error(`${new URL(address).hostname} sent ${type}, not an image`);
  return new Uint8Array(await response.arrayBuffer());
}

// Whether an address answers with an image, read no further than its headers.
export async function serves_image(address: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await fetcher(address, { signal: AbortSignal.timeout(timeout_in_milliseconds) });
    await response.body?.cancel();
    return response.ok && is_image_type(response.headers.get("content-type") ?? "");
  } catch {
    return false;
  }
}

export interface FetchCoversOptions {
  database: () => SqlDatabase;
  store: SyncFileStore;
  fetch?: typeof fetch;
  // Addresses to leave for now, such as ones that just failed.
  skip?: (address: string) => boolean;
  on_failure?: (address: string, error: unknown) => void;
}

// Downloads every cover whose address changed, a few at a time, and gives how many it kept. A failed download keeps
// the cover there was.
export async function fetch_covers(options: FetchCoversOptions): Promise<number> {
  const fetcher = options.fetch ?? fetch;
  const queue = stale_covers(options.database()).filter((cover) => !options.skip?.(cover.address));
  let kept = 0;
  const worker = async (): Promise<void> => {
    for (let cover = queue.shift(); cover; cover = queue.shift()) {
      try {
        const file = await put_file(options.store, await download(fetcher, cover.address));
        if (keep_cover(options.database(), cover, file)) kept++;
      } catch (error) {
        options.on_failure?.(cover.address, error);
      }
    }
  };
  await Promise.all(Array.from({ length: downloads_at_once }, worker));
  return kept;
}

// ── Schedule ─────────────────────────────────────────────────────────────────

const check_every_ms = 60_000;
// An address that failed waits this long before it is tried again.
const retry_after_ms = 60 * 60_000;

export interface KeepFetchingCovers {
  // Looks again soon, such as after a write that may have changed an address.
  soon: () => void;
  stop: () => void;
}

// Checks for changed addresses now, every minute and soon after each write; on_change runs when covers arrived.
export function keep_fetching_covers(options: Omit<FetchCoversOptions, "skip" | "on_failure"> & { on_change: () => void }): KeepFetchingCovers {
  const failed = new Map<string, number>();
  let running: Promise<void> | null = null;
  let again = false;
  let stopped = false;

  const run = (): void => {
    if (stopped) return;
    if (running) {
      again = true;
      return;
    }
    running = fetch_covers({
      ...options,
      skip: (address) => Date.now() - (failed.get(address) ?? -Infinity) < retry_after_ms,
      on_failure: (address) => failed.set(address, Date.now()),
    })
      .then((kept) => {
        if (kept > 0) options.on_change();
      })
      .catch(() => undefined)
      .finally(() => {
        running = null;
        if (again) {
          again = false;
          run();
        }
      });
  };

  const timer = setInterval(run, check_every_ms);
  let pending: ReturnType<typeof setTimeout> | undefined;
  run();
  return {
    soon: () => {
      clearTimeout(pending);
      pending = setTimeout(run, 1000);
    },
    stop: () => {
      stopped = true;
      clearInterval(timer);
      clearTimeout(pending);
    },
  };
}
