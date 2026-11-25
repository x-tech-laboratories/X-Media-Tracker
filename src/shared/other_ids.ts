// Ids from catalogues with no column of their own, such as one from the plugins folder, kept by the catalogue's source
// name. The page imports this file too, so it imports nothing.

export type OtherIds = Record<string, string>;

// Other ids as stored or given: a JSON object, or its text, of non-empty text values.
export function clean_other_ids(value: unknown): OtherIds {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value || "{}");
    } catch {
      return {};
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return Object.fromEntries(Object.entries(parsed).flatMap(([source, id]) => (source && typeof id === "string" && id.trim() ? [[source, id.trim()]] : [])));
}

// The key a thing known only by other ids is tracked by: the first source by name, such as shelfdb:7; "" when none.
export function other_key(value: unknown): string {
  const [source, id] = Object.entries(clean_other_ids(value)).sort(([first], [second]) => first.localeCompare(second))[0] ?? [];
  return source ? `${source}:${id}` : "";
}

export function shares_an_other_id(first: unknown, second: unknown): boolean {
  const theirs = clean_other_ids(second);
  return Object.entries(clean_other_ids(first)).some(([source, id]) => theirs[source] === id);
}

// Two answers naming different ids in one catalogue are two things.
export function other_ids_differ(first: OtherIds, second: OtherIds): boolean {
  return Object.entries(first).some(([source, id]) => second[source] && second[source] !== id);
}

// A JSON path naming a source inside the other_ids column, for json_extract.
export function other_id_path(source: string): string {
  return `$."${source.replace(/"/g, "")}"`;
}

// A catalogue with no column of its own whose plugin is on, as the page offers it for typing an id by hand.
export interface OtherCatalog {
  source: string;
  label: string;
}

// Ids typed by hand laid over the ones a thing has: each one given replaces its source's, and an empty one clears it.
export function with_typed_other_ids(current: OtherIds, typed: unknown): OtherIds {
  const next = { ...current };
  if (!typed || typeof typed !== "object" || Array.isArray(typed)) return next;
  for (const [source, id] of Object.entries(typed)) {
    if (!source || typeof id !== "string") continue;
    if (id.trim()) next[source] = id.trim();
    else delete next[source];
  }
  return next;
}
