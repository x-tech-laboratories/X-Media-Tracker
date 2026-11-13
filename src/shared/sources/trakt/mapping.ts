// Trakt's lists read into the library's shapes: watched movies and shows into import items, ratings, and the full
// history into rows to compare with the library.

// ── Imports ──────────────────────────────────────────────────────────────────

import { import_item, type ImportItem } from "../../library/importing.ts";

// ── Shapes ───────────────────────────────────────────────────────────────────

type Json = Record<string, unknown>;

export interface TraktIds {
  tmdb_id: string;
  imdb_id: string;
  trakt_id: string;
}

// One play from Trakt's history; an episode names its show's ids.
export interface HistoryRow extends TraktIds {
  history_id: number;
  media_type: "movie" | "episode";
  name: string;
  year: string;
  season: number;
  episode: number;
  watched_at: string;
  label: string;
}

function object_of(value: unknown): Json {
  return value && typeof value === "object" ? (value as Json) : {};
}

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

export function ids_of(subject: Json): TraktIds {
  const ids = object_of(subject.ids);
  return { tmdb_id: text(ids.tmdb), imdb_id: text(ids.imdb), trakt_id: text(ids.trakt) };
}

// ── Watched ──────────────────────────────────────────────────────────────────

// /sync/watched/movies and /sync/watched/shows; specials (season 0) are left out of a show's progress.
export function items_from_watched(movies: Json[], shows: Json[]): ImportItem[] {
  const items: ImportItem[] = [];
  for (const entry of movies) {
    const movie = object_of(entry.movie);
    items.push(import_item({ media_type: "movie", name: text(movie.title), year: text(movie.year), ...ids_of(movie), last_watched: text(entry.last_watched_at), status: "watched" }));
  }
  for (const entry of shows) {
    const show = object_of(entry.show);
    const episodes = (Array.isArray(entry.seasons) ? (entry.seasons as Json[]) : []).flatMap((season) =>
      Number(season.number) > 0
        ? (Array.isArray(season.episodes) ? (season.episodes as Json[]) : [])
            .filter((episode) => Number(episode.number) > 0)
            .map((episode) => ({ season: Number(season.number), episode: Number(episode.number), watched_at: text(episode.last_watched_at) }))
        : [],
    );
    items.push(import_item({ media_type: "show", name: text(show.title), year: text(show.year), ...ids_of(show), last_watched: text(entry.last_watched_at), episodes }));
  }
  return items;
}

// /sync/ratings/movies and /sync/ratings/shows; Trakt rates 1 to 10, as the library does.
export function items_from_ratings(rated: Json[]): ImportItem[] {
  return rated.flatMap((row) => {
    const subject = row.movie ?? row.show;
    const rating = Number(row.rating);
    if (!subject || !(rating > 0)) return [];
    return [import_item({ media_type: row.movie ? "movie" : "show", name: text(object_of(subject).title), ...ids_of(object_of(subject)), rating })];
  });
}

// ── History ──────────────────────────────────────────────────────────────────

// /sync/history/movies and /sync/history/episodes, newest first.
export function history_rows(movies: Json[], episodes: Json[]): HistoryRow[] {
  const rows: HistoryRow[] = [];
  for (const entry of movies) {
    const movie = object_of(entry.movie);
    const name = text(movie.title) || "Untitled";
    rows.push({ history_id: Number(entry.id), media_type: "movie", name, year: text(movie.year), ...ids_of(movie), season: 0, episode: 0, watched_at: text(entry.watched_at), label: name });
  }
  for (const entry of episodes) {
    const show = object_of(entry.show);
    const episode = object_of(entry.episode);
    const name = text(show.title) || "Untitled";
    const season = Number(episode.season);
    const number = Number(episode.number);
    const label = `${name} ${season}x${String(number).padStart(2, "0")}${episode.title ? ` · ${text(episode.title)}` : ""}`;
    rows.push({ history_id: Number(entry.id), media_type: "episode", name, year: text(show.year), ...ids_of(show), season, episode: number, watched_at: text(entry.watched_at), label });
  }
  return rows.sort((first, second) => second.watched_at.localeCompare(first.watched_at));
}

// One history row as an item to import that one watch.
export function item_from_row(row: HistoryRow): ImportItem {
  const ids = { tmdb_id: row.tmdb_id, imdb_id: row.imdb_id, trakt_id: row.trakt_id };
  if (row.media_type === "movie") return import_item({ media_type: "movie", name: row.name, year: row.year, ...ids, last_watched: row.watched_at, status: "watched" });
  return import_item({ media_type: "show", name: row.name, year: row.year, ...ids, last_watched: row.watched_at, episodes: [{ season: row.season, episode: row.episode, watched_at: row.watched_at }] });
}
