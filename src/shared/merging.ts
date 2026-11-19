// Merging what is known of one movie, show, book or game: what each catalogue says of it, in the row's own shape, and
// the checks every merge of tracked items into one makes before it writes.

// ── Shapes ───────────────────────────────────────────────────────────────────

// What one catalogue says of an item, by the same column names as its tracked row.
export interface SourceAnswer {
  source: string;
  label: string;
  values: Record<string, unknown>;
}

export interface SourceAnswers {
  answers: SourceAnswer[];
  // Catalogues that failed, by name with why, such as "RAWG: refused the key".
  failures: string[];
}

// ── Checks ───────────────────────────────────────────────────────────────────

// The ids to merge without repeats, the one kept among them.
export function merge_ids(ids: string[], keep: string): string[] {
  const unique = [...new Set(ids)];
  if (!unique.includes(keep)) throw new Error("The item kept must be one of those merged.");
  return unique;
}

// Only the columns a merge may write, each of the type the row holds.
export function merge_columns(values: Record<string, unknown>, columns: Record<string, "text" | "number" | "nullable_number">): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(values ?? {})) {
    const kind = columns[column];
    if (!kind) throw new Error(`${column} cannot be merged.`);
    if (kind === "text" && typeof value !== "string") throw new Error(`${column} must be text.`);
    if (kind === "number" && (typeof value !== "number" || !Number.isFinite(value))) throw new Error(`${column} must be a number.`);
    if (kind === "nullable_number" && value !== null && (typeof value !== "number" || !Number.isFinite(value))) throw new Error(`${column} must be a number or null.`);
    picked[column] = value;
  }
  return picked;
}
