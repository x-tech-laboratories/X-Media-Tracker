// What a tracked movie or show is, and the rules on it that need no database: episode runs such as "s01e01-e10",
// status from progress, which ids name the same title, pasted links, sorting and the Library's filters with counts.
// The page imports this file too, so it imports nothing.

// ── Titles ───────────────────────────────────────────────────────────────────

export const statuses = ["planned", "watching", "watched", "dropped"] as const;

export type Status = (typeof statuses)[number];

export type MediaType = "movie" | "show";

export interface TitleIds {
  tmdb_id: string;
  imdb_id: string;
  trakt_id: string;
}

export interface Title extends TitleIds {
  id: string;
  media_type: MediaType;
  name: string;
  year: string;
  overview: string;
  // TMDB's image path, such as "/abc.jpg"; the page picks the size.
  poster_path: string;
  // TMDB's genres as one line, such as "Drama, Sci-Fi & Fantasy".
  genres: string;
  // Minutes.
  runtime: number;
  status: Status;
  // 1 to 10, or null when unrated.
  rating: number | null;
  // The day last watched, such as 2026-07-20, or "".
  last_watched: string;
  // Aired episodes outside the specials; 0 when not known or for a movie.
  total_episodes: number;
  added_at: string;
}

// A title as the Library lists it: with its collections and how many episodes are watched.
export interface LibraryTitle extends Title {
  collection_ids: string[];
  watched_count: number;
  // The watched episodes as runs, such as "s01e01-e10,s02e01".
  watched_episodes: string;
}

export function is_status(value: unknown): value is Status {
  return typeof value === "string" && (statuses as readonly string[]).includes(value);
}

export const status_labels: Record<Status, string> = { planned: "Planned", watching: "Watching", watched: "Watched", dropped: "Dropped" };

// ── Ids ──────────────────────────────────────────────────────────────────────

// The strongest id first: TMDB holds the metadata, IMDb links the sources (Stremio has only it), Trakt last.
export function title_key(ids: Partial<TitleIds>): string {
  if (ids.tmdb_id) return `tmdb:${ids.tmdb_id}`;
  if (ids.imdb_id) return `imdb:${ids.imdb_id}`;
  if (ids.trakt_id) return `trakt:${ids.trakt_id}`;
  return "";
}

// Whether two titles share any id, so a title first seen with only an IMDb id is found once its TMDB id is known.
export function shares_an_id(first: Partial<TitleIds>, second: Partial<TitleIds>): boolean {
  const same = (one: string | undefined, other: string | undefined) => !!one && String(one) === String(other ?? "");
  return same(first.tmdb_id, second.tmdb_id) || same(first.imdb_id, second.imdb_id) || same(first.trakt_id, second.trakt_id);
}

// ── Episodes ─────────────────────────────────────────────────────────────────

// Watched episode numbers by season.
export type Seasons = Map<number, Set<number>>;

export interface EpisodeRange {
  season: number;
  from: number;
  to: number;
}

export function parse_episodes(encoded: string): Seasons {
  const seasons: Seasons = new Map();
  for (const chunk of encoded.split(",")) {
    const match = /^s(\d+)e(\d+)(?:-e(\d+))?$/i.exec(chunk.trim());
    if (!match) continue;
    const season = Number(match[1]);
    const from = Number(match[2]);
    const to = match[3] === undefined ? from : Number(match[3]);
    const episodes = seasons.get(season) ?? new Set<number>();
    for (let episode = Math.min(from, to); episode <= Math.max(from, to); episode++) episodes.add(episode);
    seasons.set(season, episodes);
  }
  return seasons;
}

function two_digits(number: number): string {
  return String(number).padStart(2, "0");
}

// Sorted and run-collapsed, so a whole season reads as one run.
export function format_episodes(seasons: Seasons): string {
  const parts: string[] = [];
  for (const season of [...seasons.keys()].sort((first, second) => first - second)) {
    const episodes = [...seasons.get(season)!].filter(Number.isFinite).sort((first, second) => first - second);
    let run_start: number | null = null;
    let previous: number | null = null;
    const flush = () => {
      if (run_start === null) return;
      const start = `s${two_digits(season)}e${two_digits(run_start)}`;
      parts.push(run_start === previous ? start : `${start}-e${two_digits(previous!)}`);
    };
    for (const episode of episodes) {
      if (previous !== null && episode === previous + 1) {
        previous = episode;
        continue;
      }
      flush();
      run_start = episode;
      previous = episode;
    }
    flush();
  }
  return parts.join(",");
}

export function count_episodes(seasons: Seasons): number {
  let total = 0;
  for (const episodes of seasons.values()) total += episodes.size;
  return total;
}

export function has_episode(seasons: Seasons, season: number, episode: number): boolean {
  return seasons.get(season)?.has(episode) ?? false;
}

// Each run as single episodes, such as for marking them one row each.
export function episodes_in(ranges: EpisodeRange[]): { season: number; episode: number }[] {
  const episodes: { season: number; episode: number }[] = [];
  for (const range of ranges) {
    if (![range.season, range.from, range.to].every(Number.isFinite)) continue;
    for (let episode = Math.min(range.from, range.to); episode <= Math.max(range.from, range.to); episode++) episodes.push({ season: range.season, episode });
  }
  return episodes;
}

// The first aired episode not yet watched, given each season's count of aired episodes.
export function next_unwatched(seasons: Seasons, season_counts: Record<number, number>): { season: number; episode: number } | null {
  for (const season of Object.keys(season_counts).map(Number).sort((first, second) => first - second)) {
    for (let episode = 1; episode <= season_counts[season]!; episode++) {
      if (!has_episode(seasons, season, episode)) return { season, episode };
    }
  }
  return null;
}

// ── Status ───────────────────────────────────────────────────────────────────

// No episodes is planned, some is watching, every aired one is watched.
export function status_from_progress(watched_count: number, total_episodes: number): Status {
  if (!total_episodes) return watched_count > 0 ? "watching" : "planned";
  if (watched_count === 0) return "planned";
  return watched_count >= total_episodes ? "watched" : "watching";
}

// ── Links ────────────────────────────────────────────────────────────────────

export type ParsedLink = { media_type: MediaType; tmdb_id: string } | { imdb_id: string };

// A pasted TMDB or IMDb link, or a bare IMDb id; TMDB's slug, trailing path and query are ignored.
export function parse_media_link(input: string): ParsedLink | null {
  const text = input.trim();
  if (!text) return null;
  const imdb = /(?:^|imdb\.com\/title\/)(tt\d{6,})/i.exec(text);
  if (imdb) return { imdb_id: imdb[1]!.toLowerCase() };
  const tmdb = /themoviedb\.org\/(movie|tv)\/(\d+)/i.exec(text);
  if (tmdb) return { media_type: tmdb[1]!.toLowerCase() === "tv" ? "show" : "movie", tmdb_id: tmdb[2]! };
  return null;
}

// ── Images ───────────────────────────────────────────────────────────────────

export const image_base = "https://image.tmdb.org/t/p/";

export const poster_sizes = ["w185", "w342", "w500"] as const;

export function image_url(path: string, size: string): string {
  return path ? `${image_base}${size}${path}` : "";
}

// The image path from a full TMDB image address, such as one the Trilium add-on kept.
export function image_path_of(url: string): string {
  if (url.startsWith("/")) return url;
  const match = /image\.tmdb\.org\/t\/p\/[^/]+(\/.+)$/.exec(url);
  return match ? match[1]! : "";
}

// ── Genres ───────────────────────────────────────────────────────────────────

export function parse_genres(value: string): string[] {
  return value
    .split(",")
    .map((genre) => genre.trim())
    .filter(Boolean);
}

// Every genre once, the first spelling kept, sorted.
export function list_genres(titles: Pick<Title, "genres">[]): string[] {
  const seen = new Map<string, string>();
  for (const title of titles) for (const genre of parse_genres(title.genres)) if (!seen.has(genre.toLowerCase())) seen.set(genre.toLowerCase(), genre);
  return [...seen.values()].sort((first, second) => first.localeCompare(second));
}

export function has_genre(title: Pick<Title, "genres">, genre: string): boolean {
  return parse_genres(title.genres).some((each) => each.toLowerCase() === genre.toLowerCase());
}

// Names trimmed, blanks dropped, and one of each whatever its case, the first spelling kept.
export function normalize_names(names: readonly unknown[]): string[] {
  const seen = new Map<string, string>();
  for (const raw of names) {
    const name = typeof raw === "string" ? raw.trim() : "";
    if (name && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name);
  }
  return [...seen.values()];
}

// ── Sorting ──────────────────────────────────────────────────────────────────

export const sort_keys = ["name", "last_watched", "year", "rating", "added_at", "progress"] as const;

export type SortKey = (typeof sort_keys)[number];

export const sort_labels: Record<SortKey, string> = {
  name: "A-Z",
  last_watched: "Recently watched",
  year: "Release date",
  rating: "Rating",
  added_at: "Recently added",
  progress: "Progress",
};

export function progress_of(title: Pick<LibraryTitle, "total_episodes" | "watched_count">): number | null {
  return title.total_episodes ? title.watched_count / title.total_episodes : null;
}

function sort_value(title: LibraryTitle, key: SortKey): string | number | null {
  if (key === "progress") return progress_of(title);
  const value = title[key];
  return value === "" ? null : value;
}

// A title missing the value sorts last either way; ties fall back to the name.
export function sort_titles<Item extends LibraryTitle>(titles: Item[], key: SortKey, descending: boolean): Item[] {
  const direction = descending ? -1 : 1;
  return [...titles].sort((first, second) => {
    const first_value = sort_value(first, key);
    const second_value = sort_value(second, key);
    if (first_value === null || second_value === null) {
      if (first_value !== second_value) return first_value === null ? 1 : -1;
      return first.name.localeCompare(second.name);
    }
    const result = typeof first_value === "number" && typeof second_value === "number" ? first_value - second_value : String(first_value).localeCompare(String(second_value));
    return result !== 0 ? result * direction : first.name.localeCompare(second.name);
  });
}

// ── Filters ──────────────────────────────────────────────────────────────────

export interface Collection {
  id: string;
  name: string;
  // Null for a collection in no group.
  group_id: string | null;
}

export interface CollectionGroup {
  id: string;
  name: string;
  position: number;
}

// "all" lets everything through; "none" in a group is titles in no collection of that group.
export interface LibraryFilters {
  search: string;
  media_type: "all" | MediaType;
  status: "all" | Status;
  genre: string;
  // A collection id, "all" or "none", by group id; ungrouped collections are under "".
  groups: Record<string, string>;
}

export const no_filters: LibraryFilters = { search: "", media_type: "all", status: "all", genre: "all", groups: {} };

type Facet = "search" | "media_type" | "status" | "genre" | `group:${string}`;

function group_of(collections: Map<string, Collection>, collection_id: string): string {
  return collections.get(collection_id)?.group_id ?? "";
}

function passes(title: LibraryTitle, filters: LibraryFilters, collections: Map<string, Collection>, skip: Facet | null): boolean {
  if (skip !== "search" && filters.search && !title.name.toLowerCase().includes(filters.search.toLowerCase())) return false;
  if (skip !== "media_type" && filters.media_type !== "all" && title.media_type !== filters.media_type) return false;
  if (skip !== "status" && filters.status !== "all" && title.status !== filters.status) return false;
  if (skip !== "genre" && filters.genre !== "all" && !has_genre(title, filters.genre)) return false;
  for (const [group_id, chosen] of Object.entries(filters.groups)) {
    if (skip === `group:${group_id}` || chosen === "all") continue;
    const in_group = title.collection_ids.filter((id) => group_of(collections, id) === group_id);
    if (chosen === "none" ? in_group.length > 0 : !in_group.includes(chosen)) return false;
  }
  return true;
}

export function filter_titles(titles: LibraryTitle[], filters: LibraryFilters, collections: Collection[]): LibraryTitle[] {
  const by_id = new Map(collections.map((collection) => [collection.id, collection]));
  return titles.filter((title) => passes(title, filters, by_id, null));
}

export interface FacetCounts {
  media_type: Record<string, number>;
  status: Record<string, number>;
  genre: Record<string, number>;
  // By group id, then by collection id or "none".
  groups: Record<string, Record<string, number>>;
}

// Each choice's count of the titles it would show: narrowed by every other filter but never by its own.
export function facet_counts(titles: LibraryTitle[], filters: LibraryFilters, collections: Collection[], group_ids: string[]): FacetCounts {
  const by_id = new Map(collections.map((collection) => [collection.id, collection]));
  const counts: FacetCounts = { media_type: {}, status: {}, genre: {}, groups: {} };
  const bump = (into: Record<string, number>, key: string) => void (into[key] = (into[key] ?? 0) + 1);
  for (const title of titles) {
    if (passes(title, filters, by_id, "media_type")) {
      bump(counts.media_type, title.media_type);
      bump(counts.media_type, "all");
    }
    if (passes(title, filters, by_id, "status")) {
      bump(counts.status, title.status);
      bump(counts.status, "all");
    }
    if (passes(title, filters, by_id, "genre")) {
      bump(counts.genre, "all");
      for (const genre of parse_genres(title.genres)) bump(counts.genre, genre.toLowerCase());
    }
    for (const group_id of group_ids) {
      if (!passes(title, filters, by_id, `group:${group_id}`)) continue;
      const into = (counts.groups[group_id] ??= {});
      bump(into, "all");
      const in_group = title.collection_ids.filter((id) => group_of(by_id, id) === group_id);
      if (in_group.length === 0) bump(into, "none");
      for (const id of in_group) bump(into, id);
    }
  }
  return counts;
}

// Titles under each collection's name, a title in several under each, and those in none last.
export function group_by_collection<Item extends LibraryTitle>(titles: Item[], collections: Collection[]): [heading: string, titles: Item[]][] {
  const names = new Map(collections.map((collection) => [collection.id, collection.name]));
  const groups = new Map<string, Item[]>();
  const untagged: Item[] = [];
  for (const title of titles) {
    const in_named = title.collection_ids.filter((id) => names.has(id));
    if (in_named.length === 0) untagged.push(title);
    for (const id of in_named) groups.set(names.get(id)!, [...(groups.get(names.get(id)!) ?? []), title]);
  }
  const named = [...groups.entries()].sort(([first], [second]) => first.localeCompare(second));
  return untagged.length ? [...named, ["In no collection", untagged]] : named;
}
