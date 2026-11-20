// Games in and out as files: games with their owned copies, playtime and collections.

// ── Imports ──────────────────────────────────────────────────────────────────

import { eq } from "@x-tech-laboratories/x-libs/drizzle";
import { in_transaction, type SqlDatabase } from "@x-tech-laboratories/x-libs/sql";

import { drizzle_of, new_id } from "../feature.ts";
import { meet_row, read_transfer, transfer_csv, transfer_file, type ImportConflict, type Row, type TransferFile, type TransferInput, type TransferReport, type TransferTable } from "../transfer.ts";
import { game_id_keys, game_key, game_launch_keys, is_game_status } from "./model.ts";
import { games_collections, games_game_collections, games_games } from "./schema.ts";
import { find_by_title, find_game, statuses_of } from "./store.ts";

// ── Tables ───────────────────────────────────────────────────────────────────

const text_columns = (names: readonly string[]) => Object.fromEntries(names.map((name) => [name, "text" as const]));

const tables: TransferTable[] = [
  {
    name: "games",
    required: true,
    columns: {
      ...text_columns(["id", ...game_id_keys, "title", "year", "release_date", "overview", "cover_url"]),
      cover_by_hand: "boolean",
      ...text_columns(["genres", "platforms", "developers", "publishers", "status"]),
      rating: "nullable_number",
      ...text_columns(["review", "notes", "owned_platforms", "owned_stores", "edition"]),
      playtime_minutes: "number",
      ...text_columns(["last_played", "added_at", "base_game", "base_game_title", ...game_launch_keys]),
    },
  },
  { name: "collections", columns: text_columns(["id", "name"]) },
  { name: "game_collections", columns: text_columns(["game_id", "collection_id"]) },
];

// What only the user says of a game, so the file saying otherwise is a choice for the merge window.
const own_columns = ["status", "rating", "review", "notes", "owned_platforms", "owned_stores", "edition"];

// ── Export ───────────────────────────────────────────────────────────────────

function games_rows(database: SqlDatabase): Record<string, Row[]> {
  const db = drizzle_of(database);
  return {
    games: db.select().from(games_games).all(),
    collections: db.select().from(games_collections).all(),
    game_collections: db.select().from(games_game_collections).all(),
  };
}

export function export_games_json(database: SqlDatabase): TransferFile {
  return transfer_file("games", tables, games_rows(database));
}

export function export_games_csv(database: SqlDatabase): Record<string, string> {
  return transfer_csv(tables, games_rows(database));
}

// ── Import ───────────────────────────────────────────────────────────────────

function parse_list(text: unknown): unknown {
  try {
    const parsed: unknown = typeof text === "string" && text ? JSON.parse(text) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// An id the file gives a game is kept only while no other game here has it.
function free_ids(database: SqlDatabase, row: Row, own_id: string): Row {
  const db = drizzle_of(database);
  const kept = { ...row };
  for (const column of game_id_keys) {
    const value = kept[column];
    if (typeof value === "string" && value && db.select({ id: games_games.id }).from(games_games).where(eq(games_games[column], value)).all().some((other) => other.id !== own_id)) delete kept[column];
  }
  return kept;
}

// The file's game as the page holds a tracked one, with its owned platforms and stores as lists.
function page_values(values: Row): Row {
  const shaped = { ...values };
  for (const column of ["owned_platforms", "owned_stores"]) if (column in shaped) shaped[column] = parse_list(shaped[column]);
  return shaped;
}

// Playtime only grows and the day last played only moves on, so the larger of each is kept without asking.
function later_play(tracked: Row, incoming: Row): Row {
  const later: Row = {};
  if (typeof incoming.playtime_minutes === "number" && incoming.playtime_minutes > Number(tracked.playtime_minutes ?? 0)) later.playtime_minutes = incoming.playtime_minutes;
  if (typeof incoming.last_played === "string" && incoming.last_played > String(tracked.last_played ?? "")) later.last_played = incoming.last_played;
  return later;
}

// New games are added whole; one already here, found by any id or by its title and year, gains its collections and
// what it lacks, and comes back as a conflict when the file says otherwise of what the user keeps.
export function import_games_file(database: SqlDatabase, input: TransferInput): TransferReport {
  const read = read_transfer("games", tables, input);
  const report: TransferReport = { added: 0, updated: 0, unchanged: 0, conflicts: [] };
  const db = drizzle_of(database);
  const statuses = statuses_of(database);

  in_transaction(database, () => {
    const collection_ids = new Map<string, string>();
    for (const collection of read.collections!) {
      const name = String(collection.name ?? "").trim();
      if (!name) continue;
      let id = db.select().from(games_collections).all().find((row) => row.name.toLowerCase() === name.toLowerCase())?.id ?? "";
      if (!id) db.insert(games_collections).values({ id: (id = new_id()), name }).run();
      collection_ids.set(String(collection.id ?? ""), id);
    }

    const game_ids = new Map<string, string>();
    const touched = new Set<string>();
    const added_ids = new Set<string>();
    const conflicts: ImportConflict[] = [];
    read.games!.forEach((game, index) => {
      const title = String(game.title ?? "").trim();
      if (!title) throw new Error(`Game ${index + 1} has no title.`);
      const { id: file_value, ...values } = game;
      const file_id = String(file_value ?? "");
      if (values.status !== undefined && !is_game_status(statuses, values.status)) delete values.status;
      const ids = Object.fromEntries(game_id_keys.map((column) => [column, String(values[column] ?? "")]));
      const existing =
        find_game(database, ids) || (file_id ? (db.select({ id: games_games.id }).from(games_games).where(eq(games_games.id, file_id)).get()?.id ?? "") : "") || find_by_title(database, title, String(values.year ?? ""));
      if (!existing) {
        const id = game_key(ids) || file_id || new_id();
        db.insert(games_games)
          .values({ ...(values as typeof games_games.$inferInsert), id, title })
          .run();
        game_ids.set(file_id, id);
        added_ids.add(id);
        report.added += 1;
        return;
      }
      game_ids.set(file_id, existing);
      const tracked = db.select().from(games_games).where(eq(games_games.id, existing)).get()!;
      const incoming = free_ids(database, values, existing);
      const { fill, conflict } = meet_row(tracked, incoming, own_columns);
      const changes = { ...fill, ...later_play(tracked, incoming) };
      if (Object.keys(changes).length > 0) {
        db.update(games_games).set(changes).where(eq(games_games.id, existing)).run();
        touched.add(existing);
      }
      if (conflict) conflicts.push({ id: existing, name: tracked.title, values: page_values({ ...incoming, title }) });
    });

    // DLC names its base game by the file's id, which may be another id here.
    for (const [file_id, id] of game_ids) {
      if (file_id && file_id !== id) db.update(games_games).set({ base_game: id }).where(eq(games_games.base_game, file_id)).run();
    }

    for (const link of read.game_collections!) {
      const game_id = game_ids.get(String(link.game_id ?? ""));
      const collection_id = collection_ids.get(String(link.collection_id ?? ""));
      if (!game_id || !collection_id) continue;
      if (Number(db.insert(games_game_collections).values({ game_id, collection_id }).onConflictDoNothing().run().changes) > 0) touched.add(game_id);
    }

    report.conflicts = conflicts;
    report.updated = [...touched].filter((id) => !added_ids.has(id)).length;
  });
  report.unchanged = read.games!.length - report.added - report.updated;
  return report;
}
