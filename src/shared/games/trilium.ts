// The Trilium Game Tracker add-on's library: its Database note, one JSON object of games keyed by their strongest id
// such as "steam:620", and its config note's statuses, read into the store's shapes. A status the user added in the
// add-on becomes the status of its name, such as Endless, or else the nearest status by its role and a collection of its name.

// ── Imports ──────────────────────────────────────────────────────────────────

import { clean_names, game_status_labels, game_statuses, release_day, type GameStatus } from "./model.ts";

// ── Shapes ───────────────────────────────────────────────────────────────────

export interface ImportedGame {
  steam_app_id: string;
  igdb_id: string;
  title: string;
  year: string;
  overview: string;
  cover_url: string;
  genres: string;
  platforms: string;
  status: GameStatus;
  rating: number | null;
  playtime_minutes: number;
  last_played: string;
  added_at: string;
  collections: string[];
}

type Json = Record<string, unknown>;

function as_object(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

function whole(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

function parse(raw: string): unknown {
  try {
    return raw.trim() ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ── Statuses ─────────────────────────────────────────────────────────────────

// The add-on's own statuses, and the roles a status the user added can take.
const built_in: Record<string, GameStatus> = { backlog: "backlog", playing: "currently_playing", paused: "on_hold", beaten: "finished", completed: "completed", dropped: "abandoned" };

const roles: Record<string, GameStatus> = { backlog: "backlog", playing: "currently_playing", paused: "on_hold", done: "finished", dropped: "abandoned" };

// A status the user added with the name of one of ours, such as Endless, is that status.
function status_named(name: string): GameStatus | undefined {
  return game_statuses.find((status) => game_status_labels[status].toLowerCase() === name.toLowerCase());
}

export interface StatusMeaning {
  status: GameStatus;
  // A collection to keep what a status of the user's own said, or "".
  collection: string;
}

// The config note's statuses, by their id in the add-on; a blank or broken note leaves only the built-in ones.
export function read_trilium_statuses(raw: string): Record<string, StatusMeaning> {
  const meanings: Record<string, StatusMeaning> = Object.fromEntries(Object.entries(built_in).map(([id, status]) => [id, { status, collection: "" }]));
  const entries = as_object(as_object(as_object(parse(raw))?.statuses)?.entries) ?? {};
  for (const [id, entry] of Object.entries(entries)) {
    if (built_in[id]) continue;
    const fields = as_object(entry) ?? {};
    const named = status_named(text(fields.name));
    meanings[id] = named ? { status: named, collection: "" } : { status: roles[text(fields.role)] ?? "backlog", collection: text(fields.name) };
  }
  return meanings;
}

// ── Reading ──────────────────────────────────────────────────────────────────

// A blank, broken or partial document reads as the games that make sense, rather than failing.
export function read_trilium_games(raw: string, statuses: Record<string, StatusMeaning> = read_trilium_statuses("")): ImportedGame[] {
  const games = as_object(as_object(parse(raw))?.games) ?? {};
  const found: ImportedGame[] = [];
  for (const [key, value] of Object.entries(games)) {
    const game = as_object(value);
    const title = text(game?.title);
    if (!game || !title) continue;
    const steam_app_id = text(game.steamAppId) || (key.startsWith("steam:") ? key.slice("steam:".length) : "");
    const meaning = statuses[text(game.status)] ?? { status: "backlog" as const, collection: "" };
    const rating = Number(game.rating);
    const collections = (Array.isArray(game.collections) ? game.collections : []).map(text);
    found.push({
      steam_app_id,
      igdb_id: text(game.igdbId),
      title,
      year: text(game.year).slice(0, 4),
      overview: text(game.summary),
      cover_url: text(game.cover),
      genres: text(game.genres),
      platforms: text(game.platforms),
      status: meaning.status,
      rating: Number.isFinite(rating) && rating >= 1 && rating <= 10 ? Math.round(rating) : null,
      playtime_minutes: whole(game.playtime),
      last_played: release_day(text(game.lastPlayed)),
      added_at: release_day(text(game.addedAt)),
      collections: clean_names([...collections, meaning.collection]),
    });
  }
  return found;
}
