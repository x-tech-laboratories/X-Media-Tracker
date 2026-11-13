// Stremio's library read into import items. Stremio keeps only where each show is up to, not its history, so a show
// counts every episode of that season up to the one last played as watched.

// ── Imports ──────────────────────────────────────────────────────────────────

import { import_item, type ImportItem } from "../../library/importing.ts";

// ── Items ────────────────────────────────────────────────────────────────────

type Json = Record<string, unknown>;

// The video last played, such as "tt0903747:2:5", or the last one in the watched record ("<video>:<count>:<bits>").
function position_of(state: Json): string {
  if (typeof state.video_id === "string" && state.video_id) return state.video_id;
  return String(state.watched ?? "").split(":").slice(0, -2).join(":");
}

// A title taken out of the Stremio library keeps its watch state, so it still counts once watched or started.
function kept_after_removal(item: Json, state: Json): boolean {
  return Number(state.timesWatched) > 0 || !!state.flaggedWatched || (item.type === "series" && position_of(state).split(":").length === 3);
}

export function items_from_stremio(library: Json[]): ImportItem[] {
  return library.flatMap((item) => {
    const state = (item.state as Json | undefined) ?? {};
    if (item.type === "other" || (item.removed && !kept_after_removal(item, state))) return [];
    const imdb_id = String(item._id ?? "").split(":")[0]!;
    if (!imdb_id.startsWith("tt")) return [];

    const last_watched = typeof state.lastWatched === "string" ? state.lastWatched : "";
    if (item.type !== "series") {
      return [import_item({ media_type: "movie", name: String(item.name ?? ""), imdb_id, last_watched, status: Number(state.timesWatched) > 0 ? "watched" : undefined })];
    }
    const [, season, episode] = position_of(state).split(":").map(Number);
    const episodes =
      season !== undefined && episode !== undefined && season > 0 && episode > 0 ? Array.from({ length: episode }, (_, index) => ({ season, episode: index + 1, watched_at: "" })) : [];
    return [import_item({ media_type: "show", name: String(item.name ?? ""), imdb_id, last_watched, episodes })];
  });
}
