// What the merge window compares of a movie or show, and how it reads each field.

// ── Imports ──────────────────────────────────────────────────────────────────

import { calls } from "../api.ts";
import { combine_lists, type MergeFieldSpec, type MergeKind } from "../merging.tsx";
import { image_url, is_status, status_labels, type LibraryTitle } from "../../shared/library/model.ts";

// ── Fields ───────────────────────────────────────────────────────────────────

const count_text = (value: unknown) => (typeof value === "number" && value ? String(value) : "");

const fields: MergeFieldSpec[] = [
  { id: "name", label: "Name", columns: ["name"] },
  { id: "media_type", label: "Kind", columns: ["media_type"], text: (value) => (value === "show" ? "TV" : value === "movie" ? "Movie" : "") },
  { id: "year", label: "Year", columns: ["year"] },
  { id: "overview", label: "Overview", columns: ["overview"] },
  { id: "poster", label: "Poster", columns: ["poster_path", "cover_file", "cover_file_from"] },
  { id: "genres", label: "Genres", columns: ["genres"], combine: combine_lists },
  { id: "runtime", label: "Runtime", columns: ["runtime"], text: (value) => (count_text(value) ? `${value} min` : "") },
  { id: "total_episodes", label: "Episodes", columns: ["total_episodes"], text: count_text },
  { id: "tmdb_id", label: "TMDB", columns: ["tmdb_id"] },
  { id: "imdb_id", label: "IMDb", columns: ["imdb_id"] },
  { id: "trakt_id", label: "Trakt", columns: ["trakt_id"] },
  { id: "status", label: "Status", columns: ["status"], personal: true, text: (value) => (is_status(value) ? status_labels[value] : "") },
  { id: "rating", label: "Rating", columns: ["rating"], personal: true, text: (value) => (typeof value === "number" ? `★ ${value}` : "") },
  { id: "last_watched", label: "Last watched", columns: ["last_watched"], personal: true },
  { id: "added_at", label: "Added", columns: ["added_at"], personal: true },
];

// ── Kind ─────────────────────────────────────────────────────────────────────

const plain = (name: string) => name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export const title_merge: MergeKind<LibraryTitle> = {
  noun: "title",
  name: (title) => title.name,
  detail: (title) => [title.year, title.media_type === "show" ? "TV" : "Movie"].filter(Boolean).join(" · "),
  cover: (values) => ({ file: String(values.cover_file ?? ""), address: image_url(String(values.poster_path ?? ""), "w185") }),
  fields,
  alike: (first, second) => first.media_type === second.media_type && plain(first.name) === plain(second.name),
  lookup_sources: (id) => calls().lookup_title_sources(id),
  merge: (ids, keep, values) => calls().merge_titles(ids, keep, values),
  href: (id) => `#/movies/title/${encodeURIComponent(id)}`,
};
