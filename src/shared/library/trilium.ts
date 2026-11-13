// The Trilium Media Tracker add-on's library: its Database note, one JSON object of titles keyed by their strongest
// id, and its collection groups setting, read into the store's shapes and written back from them. The add-on names its
// fields in camelCase, keeps a poster as a whole address and episodes as runs such as "s01e01-e10".

// ── Imports ──────────────────────────────────────────────────────────────────

import { image_path_of, is_status, normalize_names, title_key, type MediaType, type Status } from "./model.ts";

// ── Shapes ───────────────────────────────────────────────────────────────────

export interface ImportedTitle {
  id: string;
  tmdb_id: string;
  imdb_id: string;
  trakt_id: string;
  media_type: MediaType;
  name: string;
  year: string;
  overview: string;
  poster_path: string;
  genres: string;
  runtime: number;
  status: Status;
  rating: number | null;
  last_watched: string;
  total_episodes: number;
  added_at: string;
  watched_episodes: string;
  collections: string[];
}

export interface ImportedGroups {
  groups: string[];
  // The group each collection is in, by the collection's name in lower case.
  group_of: Record<string, string>;
  // Each collection's name as written, by its name in lower case.
  names: Record<string, string>;
}

type Json = Record<string, unknown>;

function as_object(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
}

function whole(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

// ── Reading ──────────────────────────────────────────────────────────────────

// A blank, broken or partial document reads as the titles that make sense, rather than failing.
export function read_trilium_database(raw: string): ImportedTitle[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("That is not the Media Tracker's Database note: it is not JSON.");
  }
  const titles = as_object(as_object(parsed)?.titles);
  if (!titles) throw new Error('That is not the Media Tracker\'s Database note: it has no "titles".');

  return Object.entries(titles).flatMap(([key, value]) => {
    const entry = as_object(value);
    if (!entry) return [];
    const rating = Number(entry.rating);
    const ids = { tmdb_id: text(entry.tmdbId), imdb_id: text(entry.imdbId), trakt_id: text(entry.traktId) };
    const id = key || title_key(ids);
    if (!id) return [];
    return [
      {
        id,
        ...ids,
        media_type: entry.mediaType === "show" ? "show" : "movie",
        name: text(entry.title) || "Untitled",
        year: text(entry.year),
        overview: text(entry.overview),
        poster_path: image_path_of(text(entry.poster)),
        genres: text(entry.genres),
        runtime: whole(entry.runtime),
        status: is_status(entry.status) ? entry.status : "planned",
        rating: Number.isFinite(rating) && rating > 0 ? rating : null,
        last_watched: text(entry.lastWatched).slice(0, 10),
        total_episodes: whole(entry.totalEpisodes),
        added_at: text(entry.addedAt).slice(0, 10),
        watched_episodes: text(entry.watchedEpisodes),
        // Older documents kept one collection as a string.
        collections: normalize_names(Array.isArray(entry.collections) ? entry.collections : [entry.collections ?? entry.collection]),
      } satisfies ImportedTitle,
    ];
  });
}

// The add-on's collectionGroups setting, such as {"groups":["Mood"],"assign":{"MCU":"Franchise"}}; blank reads as none.
export function read_trilium_groups(raw: string): ImportedGroups {
  const empty: ImportedGroups = { groups: [], group_of: {}, names: {} };
  if (!raw.trim()) return empty;
  let parsed: Json | null;
  try {
    parsed = as_object(JSON.parse(raw));
  } catch {
    throw new Error("The collection groups are not JSON.");
  }
  if (!parsed) return empty;
  const groups = normalize_names(Array.isArray(parsed.groups) ? parsed.groups : []);
  const group_of: Record<string, string> = {};
  const names: Record<string, string> = {};
  for (const [collection, group] of Object.entries(as_object(parsed.assign) ?? {})) {
    const name = collection.trim();
    if (!name || !groups.includes(text(group).trim())) continue;
    group_of[name.toLowerCase()] = text(group).trim();
    names[name.toLowerCase()] = name;
  }
  for (const [key, name] of Object.entries(as_object(parsed.names) ?? {})) {
    if (group_of[key.toLowerCase()] && text(name).trim()) names[key.toLowerCase()] = text(name).trim();
  }
  return { groups, group_of, names };
}

// ── Writing ──────────────────────────────────────────────────────────────────

// The Database note's JSON, so the library can go back to Trilium or be read by hand.
export function write_trilium_database(titles: ImportedTitle[]): string {
  const entries = titles.map((title) => [
    title.id,
    {
      tmdbId: title.tmdb_id,
      imdbId: title.imdb_id,
      traktId: title.trakt_id,
      mediaType: title.media_type,
      title: title.name,
      year: title.year,
      overview: title.overview,
      poster: title.poster_path ? `https://image.tmdb.org/t/p/w342${title.poster_path}` : "",
      genres: title.genres,
      runtime: title.runtime,
      status: title.status,
      rating: title.rating,
      lastWatched: title.last_watched,
      watchedEpisodes: title.watched_episodes,
      totalEpisodes: title.total_episodes,
      addedAt: title.added_at,
      collections: title.collections,
    },
  ]);
  return JSON.stringify({ titles: Object.fromEntries(entries) }, null, 4);
}
