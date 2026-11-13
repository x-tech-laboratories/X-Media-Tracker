// TMDB, where titles are searched and their posters, overviews, genres, cast and episode lists come from. Every call
// needs the user's free API key; it rides in the address, so no error ever repeats the address.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { MediaType } from "./model.ts";

// ── Shapes ───────────────────────────────────────────────────────────────────

export interface TmdbTitle {
  tmdb_id: string;
  media_type: MediaType;
  name: string;
  year: string;
  overview: string;
  poster_path: string;
}

export interface TmdbDetails extends TmdbTitle {
  imdb_id: string;
  genres: string;
  runtime: number;
  // Episodes per season, specials left out.
  season_counts: Record<number, number>;
  total_episodes: number;
}

export interface TmdbPerson {
  name: string;
  character: string;
  profile_path: string;
}

export interface TmdbEpisode {
  number: number;
  name: string;
  overview: string;
  air_date: string;
  runtime: number;
  rating: number | null;
  still_path: string;
}

export interface TmdbSeason {
  number: number;
  name: string;
  overview: string;
  poster_path: string;
  episodes: TmdbEpisode[];
}

export interface TmdbFullDetails extends TmdbDetails {
  cast: TmdbPerson[];
  seasons: TmdbSeason[];
}

// ── Requests ─────────────────────────────────────────────────────────────────

const api_base = "https://api.themoviedb.org/3";
const timeout_in_milliseconds = 20_000;
const cast_shown = 12;

type Fetch = typeof fetch;

type Json = Record<string, unknown>;

export interface Tmdb {
  search: (query: string, media_type: MediaType | "all") => Promise<TmdbTitle[]>;
  details: (media_type: MediaType, tmdb_id: string) => Promise<TmdbDetails>;
  find_by_imdb: (imdb_id: string, media_type: MediaType) => Promise<string>;
  full_details: (media_type: MediaType, tmdb_id: string) => Promise<TmdbFullDetails>;
}

function text_of(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function number_of(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function list_of(value: unknown): Json[] {
  return Array.isArray(value) ? (value as Json[]) : [];
}

function path_of(media_type: MediaType): string {
  return media_type === "show" ? "tv" : "movie";
}

function title_of(json: Json, media_type: MediaType): TmdbTitle {
  return {
    tmdb_id: String(json.id ?? ""),
    media_type,
    name: text_of(json.title) || text_of(json.name),
    year: (text_of(json.release_date) || text_of(json.first_air_date)).slice(0, 4),
    overview: text_of(json.overview),
    poster_path: text_of(json.poster_path),
  };
}

export function create_tmdb(api_key: string, fetcher: Fetch = fetch): Tmdb {
  if (!api_key.trim()) throw new Error("Set a TMDB API key in Settings first.");

  async function get(path: string, query: Record<string, string> = {}): Promise<Json> {
    const address = `${api_base}/${path}?${new URLSearchParams({ ...query, api_key: api_key.trim() })}`;
    let response: Response;
    try {
      response = await fetcher(address, { signal: AbortSignal.timeout(timeout_in_milliseconds) });
    } catch {
      throw new Error("TMDB could not be reached.");
    }
    if (response.ok) return (await response.json()) as Json;
    const detail = await response
      .json()
      .then((body: unknown) => text_of((body as Json).status_message))
      .catch(() => "");
    throw new Error(detail ? `TMDB: ${detail} (HTTP ${response.status})` : `TMDB request failed (HTTP ${response.status})`);
  }

  async function details(media_type: MediaType, tmdb_id: string): Promise<TmdbDetails> {
    const json = await get(`${path_of(media_type)}/${encodeURIComponent(tmdb_id)}`, { append_to_response: "external_ids" });
    const season_counts: Record<number, number> = {};
    if (media_type === "show") {
      for (const season of list_of(json.seasons)) {
        const number = number_of(season.season_number);
        if (number > 0) season_counts[number] = number_of(season.episode_count);
      }
    }
    return {
      ...title_of(json, media_type),
      imdb_id: text_of(json.imdb_id) || text_of((json.external_ids as Json | undefined)?.imdb_id),
      genres: list_of(json.genres)
        .map((genre) => text_of(genre.name))
        .filter(Boolean)
        .join(", "),
      runtime: number_of(json.runtime) || number_of((json.episode_run_time as unknown[] | undefined)?.[0]),
      season_counts,
      total_episodes: Object.values(season_counts).reduce((total, count) => total + count, 0),
    };
  }

  return {
    // All uses TMDB's multi-search; Movies and TV use their own, which fill a page with that kind alone.
    search: async (query, media_type) => {
      if (!query.trim()) return [];
      const path = media_type === "all" ? "search/multi" : `search/${path_of(media_type)}`;
      const json = await get(path, { query });
      return list_of(json.results)
        .filter((result) => media_type !== "all" || result.media_type === "movie" || result.media_type === "tv")
        .map((result) => title_of(result, media_type !== "all" ? media_type : result.media_type === "tv" ? "show" : "movie"));
    },
    details,
    find_by_imdb: async (imdb_id, media_type) => {
      const json = await get(`find/${encodeURIComponent(imdb_id)}`, { external_source: "imdb_id" });
      const [first] = list_of(media_type === "show" ? json.tv_results : json.movie_results);
      return first ? String(first.id) : "";
    },
    // The cast and each season are asked for apart, so one failing leaves the rest of the page.
    full_details: async (media_type, tmdb_id) => {
      const found = await details(media_type, tmdb_id);
      const credits = await get(`${path_of(media_type)}/${encodeURIComponent(found.tmdb_id)}/credits`).catch(() => ({}) as Json);
      const cast = list_of(credits.cast)
        .slice(0, cast_shown)
        .map((person) => ({ name: text_of(person.name), character: text_of(person.character), profile_path: text_of(person.profile_path) }));
      const seasons: TmdbSeason[] = [];
      for (const number of Object.keys(found.season_counts).map(Number).sort((first, second) => first - second)) {
        const season = await get(`tv/${encodeURIComponent(found.tmdb_id)}/season/${number}`).catch(() => null);
        if (!season) continue;
        seasons.push({
          number,
          name: text_of(season.name) || `Season ${number}`,
          overview: text_of(season.overview),
          poster_path: text_of(season.poster_path),
          episodes: list_of(season.episodes).map((episode) => ({
            number: number_of(episode.episode_number),
            name: text_of(episode.name),
            overview: text_of(episode.overview),
            air_date: text_of(episode.air_date),
            runtime: number_of(episode.runtime),
            rating: Number.isFinite(Number(episode.vote_average)) && episode.vote_average !== null ? Number(episode.vote_average) : null,
            still_path: text_of(episode.still_path),
          })),
        });
      }
      return { ...found, cast, seasons };
    },
  };
}

// Details for a title known by its TMDB id, or by its IMDb id alone, as titles from Stremio are.
export async function resolve_details(tmdb: Tmdb, media_type: MediaType, tmdb_id: string, imdb_id: string): Promise<TmdbDetails> {
  const id = tmdb_id || (imdb_id ? await tmdb.find_by_imdb(imdb_id, media_type) : "");
  if (!id) throw new Error(imdb_id ? "TMDB has no match for this title's IMDb id." : "This title has no TMDB or IMDb id to look it up by.");
  return tmdb.details(media_type, id);
}
