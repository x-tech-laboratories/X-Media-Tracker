// Movies & Series in and out as files: titles with their watched episodes, collections and collection groups.

// ── Imports ──────────────────────────────────────────────────────────────────

import { today } from "@x-tech-laboratories/x-libs/dates";
import { eq } from "@x-tech-laboratories/x-libs/drizzle";
import { in_transaction, type SqlDatabase } from "@x-tech-laboratories/x-libs/sql";

import { drizzle_of, new_id } from "../feature.ts";
import { meet_row, read_transfer, transfer_csv, transfer_file, type ImportConflict, type Row, type TransferFile, type TransferInput, type TransferReport, type TransferTable } from "../transfer.ts";
import { is_status, title_key } from "./model.ts";
import { library_collection_groups, library_collections, library_episodes, library_title_collections, library_titles } from "./schema.ts";
import { find_title } from "./store.ts";

// ── Tables ───────────────────────────────────────────────────────────────────

const text_columns = (names: string[]) => Object.fromEntries(names.map((name) => [name, "text" as const]));

const tables: TransferTable[] = [
  {
    name: "titles",
    required: true,
    columns: {
      ...text_columns(["id", "tmdb_id", "imdb_id", "trakt_id", "media_type", "name", "year", "overview", "poster_path", "genres"]),
      runtime: "number",
      total_episodes: "number",
      ...text_columns(["status"]),
      rating: "nullable_number",
      ...text_columns(["notes", "last_watched", "added_at"]),
    },
  },
  { name: "episodes", columns: { ...text_columns(["title_id"]), season: "number", episode: "number", watched_at: "text" } },
  { name: "collection_groups", columns: { ...text_columns(["id", "name"]), position: "number" } },
  { name: "collections", columns: text_columns(["id", "name", "group_id"]) },
  { name: "title_collections", columns: text_columns(["title_id", "collection_id"]) },
];

// What only the user says of a title, so the file saying otherwise is a choice for the merge window.
const own_columns = ["status", "rating", "notes", "last_watched"];

const id_columns = ["tmdb_id", "imdb_id", "trakt_id"] as const;

// ── Export ───────────────────────────────────────────────────────────────────

function library_rows(database: SqlDatabase): Record<string, Row[]> {
  const db = drizzle_of(database);
  return {
    titles: db.select().from(library_titles).all(),
    episodes: db.select().from(library_episodes).all(),
    collection_groups: db.select().from(library_collection_groups).all(),
    collections: db
      .select()
      .from(library_collections)
      .all()
      .map((collection) => ({ ...collection, group_id: collection.group_id ?? "" })),
    title_collections: db.select().from(library_title_collections).all(),
  };
}

export function export_library_json(database: SqlDatabase): TransferFile {
  return transfer_file("movies", tables, library_rows(database));
}

export function export_library_csv(database: SqlDatabase): Record<string, string> {
  return transfer_csv(tables, library_rows(database));
}

// ── Import ───────────────────────────────────────────────────────────────────

function named(rows: { id: string; name: string }[], name: string): string {
  return rows.find((row) => row.name.toLowerCase() === name.toLowerCase())?.id ?? "";
}

// An id the file gives a title is kept only while no other title here has it.
function free_ids(database: SqlDatabase, row: Row, own_id: string): Row {
  const db = drizzle_of(database);
  const kept = { ...row };
  for (const column of id_columns) {
    const value = kept[column];
    if (typeof value === "string" && value && db.select({ id: library_titles.id }).from(library_titles).where(eq(library_titles[column], value)).all().some((other) => other.id !== own_id)) delete kept[column];
  }
  return kept;
}

// New titles are added whole; one already here, found by any id, gains its episodes and collections and what it lacks,
// and comes back as a conflict when the file says otherwise of its status, rating, notes or last watched day.
export function import_library_file(database: SqlDatabase, input: TransferInput): TransferReport {
  const read = read_transfer("movies", tables, input);
  const report: TransferReport = { added: 0, updated: 0, unchanged: 0, conflicts: [] };
  const db = drizzle_of(database);

  in_transaction(database, () => {
    const group_ids = new Map<string, string>();
    for (const group of read.collection_groups!) {
      const name = String(group.name ?? "").trim();
      if (!name) continue;
      const groups = db.select().from(library_collection_groups).all();
      let id = named(groups, name);
      if (!id) db.insert(library_collection_groups).values({ id: (id = new_id()), name, position: groups.length }).run();
      group_ids.set(String(group.id ?? ""), id);
    }

    const collection_ids = new Map<string, string>();
    for (const collection of read.collections!) {
      const name = String(collection.name ?? "").trim();
      if (!name) continue;
      let id = named(db.select().from(library_collections).all(), name);
      if (!id) db.insert(library_collections).values({ id: (id = new_id()), name, group_id: group_ids.get(String(collection.group_id ?? "")) ?? null }).run();
      collection_ids.set(String(collection.id ?? ""), id);
    }

    const title_ids = new Map<string, string>();
    const touched = new Set<string>();
    const added_ids = new Set<string>();
    const conflicts: ImportConflict[] = [];
    read.titles!.forEach((title, index) => {
      const name = String(title.name ?? "").trim();
      if (!name) throw new Error(`Title ${index + 1} has no name.`);
      if (title.media_type !== "movie" && title.media_type !== "show") throw new Error(`${name} is neither a movie nor a show.`);
      const { id: file_value, ...values } = title;
      const file_id = String(file_value ?? "");
      if (values.status !== undefined && !is_status(values.status)) delete values.status;
      const ids = { tmdb_id: String(values.tmdb_id ?? ""), imdb_id: String(values.imdb_id ?? ""), trakt_id: String(values.trakt_id ?? "") };
      const existing = find_title(database, ids) || (file_id ? (db.select({ id: library_titles.id }).from(library_titles).where(eq(library_titles.id, file_id)).get()?.id ?? "") : "");
      if (!existing) {
        const id = title_key(ids) || file_id || new_id();
        db.insert(library_titles)
          .values({ ...(values as typeof library_titles.$inferInsert), id, name })
          .run();
        title_ids.set(file_id, id);
        added_ids.add(id);
        report.added += 1;
        return;
      }
      title_ids.set(file_id, existing);
      const tracked = db.select().from(library_titles).where(eq(library_titles.id, existing)).get()!;
      const { fill, conflict } = meet_row(tracked, free_ids(database, values, existing), own_columns);
      if (Object.keys(fill).length > 0) {
        db.update(library_titles).set(fill).where(eq(library_titles.id, existing)).run();
        touched.add(existing);
      }
      if (conflict) conflicts.push({ id: existing, name: tracked.name, values: { ...free_ids(database, values, existing), name } });
    });

    const marked_on = today();
    for (const episode of read.episodes!) {
      const title_id = title_ids.get(String(episode.title_id ?? ""));
      if (!title_id || typeof episode.season !== "number" || typeof episode.episode !== "number") continue;
      const added = db
        .insert(library_episodes)
        .values({ title_id, season: episode.season, episode: episode.episode, watched_at: String(episode.watched_at ?? "") || marked_on })
        .onConflictDoNothing()
        .run();
      if (Number(added.changes) > 0) touched.add(title_id);
    }

    for (const link of read.title_collections!) {
      const title_id = title_ids.get(String(link.title_id ?? ""));
      const collection_id = collection_ids.get(String(link.collection_id ?? ""));
      if (!title_id || !collection_id) continue;
      if (Number(db.insert(library_title_collections).values({ title_id, collection_id }).onConflictDoNothing().run().changes) > 0) touched.add(title_id);
    }

    report.conflicts = conflicts;
    report.updated = [...touched].filter((id) => !added_ids.has(id)).length;
  });
  report.unchanged = read.titles!.length - report.added - report.updated;
  return report;
}
