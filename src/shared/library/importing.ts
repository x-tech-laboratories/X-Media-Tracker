// Bringing titles in from another service, such as Trakt or Stremio: one way and additive. A title is matched on any
// shared id, its episodes are merged and never unwatched, and its status and rating are kept unless Settings says
// otherwise. TMDB is asked first, then everything is written in one transaction, so an import never half-applies.

// ── Imports ──────────────────────────────────────────────────────────────────

import { today } from "@x-tech-laboratories/x-libs/dates";
import { eq } from "@x-tech-laboratories/x-libs/drizzle";
import { in_transaction, type SqlDatabase } from "@x-tech-laboratories/x-libs/sql";

import { drizzle_of } from "../feature.ts";
import { title_key, type MediaType, type Status } from "./model.ts";
import { library_titles } from "./schema.ts";
import { find_title, settle_status, setting, tmdb_of, write_episodes, type ImportReport } from "./store.ts";
import { resolve_details, type TmdbDetails } from "./tmdb.ts";

// ── Items ────────────────────────────────────────────────────────────────────

export interface ImportedEpisode {
  season: number;
  episode: number;
  // The day it was watched, such as 2026-07-20, or "" when the source does not say.
  watched_at: string;
}

export interface ImportItem {
  media_type: MediaType;
  name: string;
  year: string;
  tmdb_id: string;
  imdb_id: string;
  trakt_id: string;
  // The day last watched, or "".
  last_watched: string;
  // A movie's status from the source, such as watched; a show's comes from its episodes.
  status?: Status;
  rating?: number | null;
  episodes?: ImportedEpisode[];
}

// Only the parts of an item a source knows, the rest blank.
export function import_item(fields: Partial<ImportItem> & Pick<ImportItem, "media_type">): ImportItem {
  return { name: "", year: "", tmdb_id: "", imdb_id: "", trakt_id: "", last_watched: "", ...fields };
}

export interface ImportOptions {
  // Takes the item's status even when the setting to do so is off, as when the user imports one watch by hand.
  marks_watched?: boolean;
}

// ── Import ───────────────────────────────────────────────────────────────────

function day_of(moment: string): string {
  return moment.slice(0, 10);
}

// A new title is looked up on TMDB first when Settings asks, so it arrives with its poster and episode count.
async function details_for(database: SqlDatabase, items: ImportItem[]): Promise<Map<ImportItem, TmdbDetails>> {
  const found = new Map<ImportItem, TmdbDetails>();
  if (!setting(database, "library.import_fetch_metadata") || !setting(database, "library.tmdb_api_key").trim()) return found;
  const tmdb = tmdb_of(database);
  for (const item of items) {
    if (find_title(database, item) || !(item.tmdb_id || item.imdb_id)) continue;
    try {
      found.set(item, await resolve_details(tmdb, item.media_type, item.tmdb_id, item.imdb_id));
    } catch {
      // Details are a nicety; the title still comes in without them.
    }
  }
  return found;
}

export async function apply_import(database: SqlDatabase, items: ImportItem[], options: ImportOptions = {}): Promise<ImportReport> {
  const details = await details_for(database, items);
  const marks_watched = options.marks_watched ?? setting(database, "library.import_marks_watched");
  const overwrite_ratings = setting(database, "library.import_overwrite_ratings");

  return in_transaction(database, () => {
    const db = drizzle_of(database);
    const report: ImportReport = { added: 0, updated: 0 };
    for (const item of items) {
      const looked_up = details.get(item);
      const ids = {
        tmdb_id: looked_up?.tmdb_id || item.tmdb_id,
        imdb_id: looked_up?.imdb_id || item.imdb_id,
        trakt_id: item.trakt_id,
      };
      let id = find_title(database, ids);
      const rating = item.rating && item.rating > 0 ? item.rating : null;

      if (id) {
        const row = db.select().from(library_titles).where(eq(library_titles.id, id)).get()!;
        db.update(library_titles)
          .set({
            tmdb_id: row.tmdb_id || ids.tmdb_id,
            imdb_id: row.imdb_id || ids.imdb_id,
            trakt_id: row.trakt_id || ids.trakt_id,
            year: row.year || item.year,
            rating: rating !== null && (overwrite_ratings || row.rating === null) ? rating : row.rating,
            last_watched: [row.last_watched, day_of(item.last_watched)].sort().at(-1)!,
          })
          .where(eq(library_titles.id, id))
          .run();
        report.updated++;
      } else {
        id = title_key(ids);
        if (!id) continue;
        db.insert(library_titles)
          .values({
            id,
            ...ids,
            media_type: item.media_type,
            name: looked_up?.name || item.name || "Untitled",
            year: looked_up?.year || item.year,
            overview: looked_up?.overview ?? "",
            poster_path: looked_up?.poster_path ?? "",
            genres: looked_up?.genres ?? "",
            runtime: looked_up?.runtime ?? 0,
            total_episodes: looked_up?.total_episodes ?? 0,
            rating,
            last_watched: day_of(item.last_watched),
            added_at: today(),
          })
          .run();
        report.added++;
      }

      if (item.media_type === "show" && item.episodes?.length) {
        write_episodes(database, id, item.episodes.map((episode) => ({ ...episode, watched_at: day_of(episode.watched_at) })), true);
        if (marks_watched) settle_status(database, id);
      } else if (item.status && marks_watched) {
        db.update(library_titles).set({ status: item.status }).where(eq(library_titles.id, id)).run();
      }
    }
    return report;
  });
}
