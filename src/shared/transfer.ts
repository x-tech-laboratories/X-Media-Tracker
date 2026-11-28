// Moving a section of the library, or the settings, in and out as files: JSON holding every table, or one CSV file per
// table, read into the same rows; and how an item read from a file meets the one already tracked.

// ── Imports ──────────────────────────────────────────────────────────────────

import { csv_records, write_csv_records } from "@x-tech-laboratories/x-libs/csv";

// ── Shapes ───────────────────────────────────────────────────────────────────

export type TransferKind = "movies" | "books" | "games" | "settings";

export type ColumnKind = "text" | "number" | "nullable_number" | "boolean";

export type Row = Record<string, unknown>;

// A table as it travels: its name in the file, such as "titles", and its columns with the type each holds.
export interface TransferTable {
  name: string;
  columns: Record<string, ColumnKind>;
  // The table an import cannot do without, such as the titles.
  required?: boolean;
}

export interface TransferFile {
  app: "x-media-tracker";
  kind: TransferKind;
  version: 1;
  exported_at: string;
  tables: Record<string, Row[]>;
}

// What the page sends: a JSON export, or CSV files by name, such as { "titles.csv": "id,name\r\n…" }.
export type TransferInput = { json: unknown } | { csv: Record<string, string> };

// An item tracked here that the file says other things of, for the page to settle in the merge window.
export interface ImportConflict {
  id: string;
  name: string;
  // The file's item, by the tracked row's own column names.
  values: Row;
}

export interface TransferReport {
  added: number;
  updated: number;
  unchanged: number;
  conflicts: ImportConflict[];
}

// ── Writing ──────────────────────────────────────────────────────────────────

// Only the columns each table travels with, in their order.
function pick_columns(tables: TransferTable[], rows: Record<string, Row[]>): Record<string, Row[]> {
  return Object.fromEntries(tables.map((table) => [table.name, (rows[table.name] ?? []).map((row) => Object.fromEntries(Object.keys(table.columns).map((column) => [column, row[column]])))]));
}

export function transfer_file(kind: TransferKind, tables: TransferTable[], rows: Record<string, Row[]>, now = new Date()): TransferFile {
  return { app: "x-media-tracker", kind, version: 1, exported_at: now.toISOString(), tables: pick_columns(tables, rows) };
}

// One CSV file per table, such as titles.csv, a true or false written as 1 or 0.
export function transfer_csv(tables: TransferTable[], rows: Record<string, Row[]>): Record<string, string> {
  return Object.fromEntries(
    tables.map((table) => {
      const records = (rows[table.name] ?? []).map((row) => Object.fromEntries(Object.keys(table.columns).map((column) => [column, typeof row[column] === "boolean" ? (row[column] ? 1 : 0) : (row[column] as string | number | null)])));
      return [`${table.name}.csv`, write_csv_records(Object.keys(table.columns), records)];
    }),
  );
}

// ── Reading ──────────────────────────────────────────────────────────────────

function cell_of(text: string, kind: ColumnKind, where: string): unknown {
  if (kind === "text") return text;
  if (kind === "boolean") return ["1", "true", "yes"].includes(text.trim().toLowerCase());
  if (text.trim() === "") return kind === "nullable_number" ? null : 0;
  const value = Number(text);
  if (!Number.isFinite(value)) throw new Error(`${where} must be a number.`);
  return value;
}

function value_of(value: unknown, kind: ColumnKind, where: string): unknown {
  if (kind === "text" && typeof value !== "string") throw new Error(`${where} must be text.`);
  if (kind === "boolean" && typeof value !== "boolean") {
    if (value === 0 || value === 1) return value === 1;
    throw new Error(`${where} must be true or false.`);
  }
  if (kind === "number" && (typeof value !== "number" || !Number.isFinite(value))) throw new Error(`${where} must be a number.`);
  if (kind === "nullable_number" && value !== null && (typeof value !== "number" || !Number.isFinite(value))) throw new Error(`${where} must be a number or empty.`);
  return value;
}

// A CSV file's name without its folder or case, so "export/Titles.csv" is titles.csv.
function file_key(name: string): string {
  return name.split("/").at(-1)!.toLowerCase();
}

function read_json(kind: TransferKind, json: unknown): Record<string, unknown> {
  let file = json;
  if (typeof file === "string") {
    try {
      file = JSON.parse(file);
    } catch {
      throw new Error("That file is not JSON.");
    }
  }
  const envelope = (file ?? {}) as Partial<TransferFile>;
  if (envelope.app !== "x-media-tracker" || typeof envelope.tables !== "object" || envelope.tables === null) throw new Error("That file is not an X-Media-Tracker export.");
  if (envelope.kind !== kind) throw new Error(`That file is an export of ${String(envelope.kind)}, not of ${kind}.`);
  return envelope.tables as Record<string, unknown>;
}

// Each table's rows with every value of the type its column holds; a column a row leaves out stays out, so it changes nothing.
export function read_transfer(kind: TransferKind, tables: TransferTable[], input: TransferInput): Record<string, Row[]> {
  const read: Record<string, Row[]> = {};
  if ("json" in input) {
    const found = read_json(kind, input.json);
    for (const table of tables) {
      const rows = found[table.name];
      if (rows === undefined && table.required) throw new Error(`The file has no ${table.name}.`);
      if (rows !== undefined && !Array.isArray(rows)) throw new Error(`The file's ${table.name} must be a list.`);
      read[table.name] = ((rows ?? []) as Row[]).map((row, index) =>
        Object.fromEntries(Object.entries(table.columns).flatMap(([column, column_kind]) => (row && column in row ? [[column, value_of(row[column], column_kind, `${table.name} ${index + 1}'s ${column}`)]] : []))),
      );
    }
    return read;
  }
  const files = new Map(Object.entries(input.csv ?? {}).map(([name, text]) => [file_key(name), text]));
  for (const table of tables) {
    const text = files.get(`${table.name}.csv`);
    if (text === undefined && table.required) throw new Error(`No ${table.name}.csv among the files.`);
    read[table.name] = csv_records(text ?? "").map((record, index) =>
      Object.fromEntries(Object.entries(table.columns).flatMap(([column, column_kind]) => (column in record ? [[column, cell_of(record[column]!, column_kind, `Row ${index + 2} of ${table.name}.csv: ${column}`)]] : []))),
    );
  }
  return read;
}

// ── Meeting ──────────────────────────────────────────────────────────────────

// Nothing said: empty text, an empty list, no number or no rating, or false.
export function is_blank(value: unknown): boolean {
  return value === undefined || value === null || value === "" || value === "[]" || value === 0 || value === false;
}

function same(first: unknown, second: unknown): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

// What the file fills in where the tracked item has nothing, and whether it says otherwise of a column the user keeps.
export function meet_row(tracked: Row, incoming: Row, own_columns: readonly string[]): { fill: Row; conflict: boolean } {
  const fill: Row = {};
  let conflict = false;
  for (const [column, value] of Object.entries(incoming)) {
    if (is_blank(value) || same(tracked[column], value)) continue;
    if (is_blank(tracked[column])) fill[column] = value;
    else if (own_columns.includes(column)) conflict = true;
  }
  return { fill, conflict };
}
