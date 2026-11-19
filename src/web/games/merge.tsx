// What the merge window compares of a game, and how it reads each field.

// ── Imports ──────────────────────────────────────────────────────────────────

import { calls } from "../api.ts";
import { combine_arrays, combine_lists, type MergeFieldSpec, type MergeKind } from "../merging.tsx";
import { title_words } from "../../shared/games/catalog.ts";
import { format_playtime, game_status_text, is_game_status, type LibraryGame } from "../../shared/games/model.ts";
import { game_href, stars_text } from "./actions.tsx";

// ── Fields ───────────────────────────────────────────────────────────────────

const fields: MergeFieldSpec[] = [
  { id: "title", label: "Title", columns: ["title"] },
  { id: "year", label: "Year", columns: ["year"] },
  { id: "release_date", label: "Released", columns: ["release_date"] },
  { id: "overview", label: "Overview", columns: ["overview"] },
  { id: "cover", label: "Cover", columns: ["cover_url", "cover_file", "cover_file_from", "cover_by_hand"] },
  { id: "genres", label: "Genres", columns: ["genres"], combine: combine_lists },
  { id: "platforms", label: "Platforms", columns: ["platforms"], combine: combine_lists },
  { id: "developers", label: "Developers", columns: ["developers"], combine: combine_lists },
  { id: "publishers", label: "Publishers", columns: ["publishers"], combine: combine_lists },
  { id: "base_game", label: "DLC of", columns: ["base_game", "base_game_title"] },
  { id: "rawg_id", label: "RAWG", columns: ["rawg_id"] },
  { id: "mobygames_id", label: "MobyGames", columns: ["mobygames_id"] },
  { id: "giantbomb_id", label: "Giant Bomb", columns: ["giantbomb_id"] },
  { id: "wikidata_id", label: "Wikidata", columns: ["wikidata_id"] },
  { id: "steam_app_id", label: "Steam", columns: ["steam_app_id"] },
  { id: "igdb_id", label: "IGDB", columns: ["igdb_id"] },
  { id: "thegamesdb_id", label: "TheGamesDB", columns: ["thegamesdb_id"] },
  { id: "gog_id", label: "GOG", columns: ["gog_id"] },
  { id: "steamgriddb_id", label: "SteamGridDB", columns: ["steamgriddb_id"] },
  { id: "itchio_id", label: "itch.io", columns: ["itchio_id"] },
  { id: "status", label: "Status", columns: ["status"], personal: true, text: (value) => (is_game_status(value) ? game_status_text(value) : "") },
  { id: "rating", label: "Rating", columns: ["rating"], personal: true, text: (value) => stars_text(value as number | null) },
  { id: "review", label: "Review", columns: ["review"], personal: true },
  { id: "notes", label: "Notes", columns: ["notes"], personal: true },
  { id: "owned_platforms", label: "Owned on", columns: ["owned_platforms"], personal: true, combine: combine_arrays },
  { id: "owned_stores", label: "Owned from", columns: ["owned_stores"], personal: true, combine: combine_arrays },
  { id: "edition", label: "Edition", columns: ["edition"], personal: true },
  { id: "playtime_minutes", label: "Playtime", columns: ["playtime_minutes"], personal: true, text: (value) => format_playtime(Number(value) || 0) },
  { id: "last_played", label: "Last played", columns: ["last_played"], personal: true },
  { id: "added_at", label: "Added", columns: ["added_at"], personal: true },
];

// ── Kind ─────────────────────────────────────────────────────────────────────

export const game_merge: MergeKind<LibraryGame> = {
  noun: "game",
  name: (game) => game.title,
  detail: (game) => [game.year, game.platforms].filter(Boolean).join(" · "),
  cover: (values) => ({ file: String(values.cover_file ?? ""), address: String(values.cover_url ?? "") }),
  fields,
  alike: (first, second) => title_words(first.title) === title_words(second.title),
  lookup_sources: (id) => calls().lookup_game_sources(id),
  merge: (ids, keep, values) => calls().merge_games(ids, keep, values),
  href: game_href,
};
