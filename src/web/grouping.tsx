// Showing a library's items in groups under headings, such as by status or collection, as covers or a table per group.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { ReactNode } from "react";

import { group_items, type GroupOptions } from "@x-tech-laboratories/x-libs/grouping";
import { GroupSections } from "@x-tech-laboratories/x-libs/web/react/layout";
import { GroupedMediaGrid } from "@x-tech-laboratories/x-libs/web/react/media";

// ── Groupings ────────────────────────────────────────────────────────────────

export interface Grouping<Item> extends GroupOptions {
  label: string;
  // The keys an item is grouped under; none puts it in the last group.
  keys_of: (item: Item) => string | readonly string[] | null;
  // A group's heading from its key, null being the items with no key.
  name_of: (key: string | null) => string;
}

// A line of text such as "Drama, Sci-Fi & Fantasy" as its parts.
export function parts_of(line: string): string[] {
  return line.split(",").map((part) => part.trim()).filter(Boolean);
}

// A rating as its key, so the groups run from the highest down when descending.
export function rating_key(rating: number | null): string | null {
  return rating ? String(rating) : null;
}

// ── Lists ────────────────────────────────────────────────────────────────────

interface GroupedListProps<Item> {
  items: Item[];
  grouping: Grouping<Item>;
  as_table: boolean;
  tile: (item: Item) => ReactNode;
  table: (items: Item[]) => ReactNode;
}

// The items under a heading per group, keeping their sorted order inside each.
export function GroupedList<Item>({ items, grouping, as_table, tile, table }: GroupedListProps<Item>) {
  const groups = group_items(items, grouping.keys_of, grouping);
  if (as_table) return <GroupSections groups={groups} name_of={grouping.name_of}>{(members) => table(members)}</GroupSections>;
  return <GroupedMediaGrid groups={groups} name_of={grouping.name_of}>{tile}</GroupedMediaGrid>;
}
