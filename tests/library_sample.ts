// A small library written straight into a database, for tests that need titles without TMDB.

import type { DatabaseSync } from "node:sqlite";

import { record_history } from "../src/shared/history/store.ts";

const titles = [
  { id: "tmdb:693134", tmdb_id: "693134", imdb_id: "tt15239678", media_type: "movie", name: "Dune: Part Two", year: "2024", poster_path: "/dune.jpg", genres: "Science Fiction, Adventure", status: "watched", rating: 9, last_watched: "2026-07-20", total_episodes: 0, added_at: "2026-07-01" },
  { id: "tmdb:95396", tmdb_id: "95396", imdb_id: "", media_type: "show", name: "Severance", year: "2022", poster_path: "", genres: "Drama, Sci-Fi & Fantasy", status: "watching", rating: null, last_watched: "", total_episodes: 19, added_at: "2026-06-01" },
  { id: "imdb:tt0903747", tmdb_id: "", imdb_id: "tt0903747", media_type: "show", name: "Breaking Bad", year: "", poster_path: "", genres: "", status: "planned", rating: null, last_watched: "", total_episodes: 0, added_at: "" },
];

const episodes = [...Array.from({ length: 9 }, (_, index) => [1, index + 1]), [2, 1]];

const collections = [
  { name: "Dune", group: "Franchise", titles: ["tmdb:693134"] },
  { name: "Comfort", group: "Mood", titles: ["tmdb:95396"] },
  { name: "Apple", group: null, titles: ["tmdb:95396"] },
  { name: "Crime", group: null, titles: ["imdb:tt0903747"] },
];

// Dune: Part Two watched, Severance part way through, Breaking Bad planned, and their collections, optionally in the
// groups Mood and Franchise; history keeps them as one change, as a store call would.
export function seed_library(database: DatabaseSync, { groups = false } = {}): void {
  database.exec("BEGIN");
  if (groups) {
    for (const [position, name] of ["Mood", "Franchise"].entries()) database.prepare("INSERT INTO library_collection_groups (id, name, position) VALUES (?, ?, ?)").run(`group-${name}`, name, position);
  }
  for (const title of titles) {
    const columns = Object.keys(title);
    database.prepare(`INSERT INTO library_titles (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`).run(...Object.values(title));
  }
  for (const [season, episode] of episodes) database.prepare("INSERT INTO library_episodes (title_id, season, episode) VALUES ('tmdb:95396', ?, ?)").run(season!, episode!);
  for (const collection of collections) {
    database.prepare("INSERT INTO library_collections (id, name, group_id) VALUES (?, ?, ?)").run(`collection-${collection.name}`, collection.name, groups && collection.group ? `group-${collection.group}` : null);
    for (const title_id of collection.titles) database.prepare("INSERT INTO library_title_collections (title_id, collection_id) VALUES (?, ?)").run(title_id, `collection-${collection.name}`);
  }
  database.exec("COMMIT");
  record_history(database);
}

// Movies known only by their TMDB ids, each named after its id and planned.
export function seed_movies(database: DatabaseSync, tmdb_ids: string[]): void {
  for (const id of tmdb_ids) database.prepare("INSERT INTO library_titles (id, tmdb_id, media_type, name, status) VALUES (?, ?, 'movie', ?, 'planned')").run(`tmdb:${id}`, id, `Movie ${id}`);
  record_history(database);
}
