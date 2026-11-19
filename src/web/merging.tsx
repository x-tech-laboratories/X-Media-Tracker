// The merge window: one movie, show, book or game as each tracked copy of it and each catalogue knows it, side by side,
// one row per field, so the value each field keeps is picked from any of them; tracked copies merged become one. After
// an import it settles, one item at a time, each tracked item the file said otherwise of.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useState, type ReactNode } from "react";
import { SearchBox, Switch } from "@x-tech-laboratories/x-libs/web/react/controls";
import { open_dialog } from "@x-tech-laboratories/x-libs/web/react/dialog";
import { Section, Stack } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Cover } from "@x-tech-laboratories/x-libs/web/react/media";
import { is_conflict, merge_text, MergeGrid, winner_of, type MergeChoices, type MergeField } from "@x-tech-laboratories/x-libs/web/react/merge_grid";
import { PageView } from "@x-tech-laboratories/x-libs/web/react/page_view";
import { use_pref } from "@x-tech-laboratories/x-libs/web/react/prefs";
import { Loaded, use_resource } from "@x-tech-laboratories/x-libs/web/react/states";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";
import { plural } from "@x-tech-laboratories/x-libs/web/format";
import { is_boolean } from "@x-tech-laboratories/x-libs/web/prefs";

import type { SourceAnswers } from "../shared/merging.ts";
import type { ImportConflict } from "../shared/transfer.ts";
import { use_cover } from "./covers.tsx";

// ── Shapes ───────────────────────────────────────────────────────────────────

// A tracked movie, show, book or game, read by its row's own column names.
export type Tracked = { id: string };

// One column of the window: a tracked copy, or what one catalogue says.
export interface MergeColumn {
  key: string;
  label: string;
  tracked: boolean;
  values: Record<string, unknown>;
}

export interface MergeFieldSpec {
  id: string;
  label: string;
  // The row's columns this field writes, the first one shown and compared, such as a book's authors and their ids.
  columns: string[];
  text?: (value: unknown) => string;
  // Offers Keep all, every column's values joined, such as all the genres.
  combine?: (values: unknown[]) => unknown;
  // Only a tracked copy has it, such as its status or rating, so the catalogues are left out of it.
  personal?: boolean;
}

export interface MergeKind<Item extends Tracked> {
  // Such as "book", for "Merge 2 books".
  noun: string;
  name: (item: Item) => string;
  // A line under its name, such as its authors and year.
  detail: (item: Item) => string;
  // The cover's kept file and address, to tell the columns apart at a glance.
  cover: (values: Record<string, unknown>) => { file: string; address: string };
  fields: MergeFieldSpec[];
  // Whether two tracked items look like the same one, to offer as duplicates.
  alike: (first: Item, second: Item) => boolean;
  lookup_sources: (id: string) => Promise<SourceAnswers>;
  merge: (ids: string[], keep: string, values: Record<string, unknown>) => Promise<unknown>;
  // Where the kept item's page is, opened when another one than the open one is kept.
  href: (id: string) => string;
}

// The item as an imported file has it, settled against the tracked one, with where it stands among the others to settle.
export interface ImportedCopy {
  values: Record<string, unknown>;
  // Such as "2 of 5".
  place: string;
  skip_rest: () => void;
}

const file_key = "file";

const no_sources: SourceAnswers = { answers: [], failures: [] };

// ── Picking ──────────────────────────────────────────────────────────────────

// Words joined by commas, each once whatever its case, in the order first seen.
export function combine_lists(values: unknown[]): string {
  const kept: string[] = [];
  for (const value of values) {
    const words = Array.isArray(value) ? value.map(String) : String(value ?? "").split(",");
    for (const word of words.map((each) => each.trim()).filter(Boolean)) if (!kept.some((each) => each.toLowerCase() === word.toLowerCase())) kept.push(word);
  }
  return kept.join(", ");
}

// The same, kept as a list, such as the platforms a game is owned on.
export function combine_arrays(values: unknown[]): string[] {
  return combine_lists(values).split(", ").filter(Boolean);
}

function grid_field(spec: MergeFieldSpec): MergeField<MergeColumn> {
  return { id: spec.id, label: spec.label, value: (column) => column.values[spec.columns[0]!] ?? null, text: spec.text, combine: spec.combine };
}

// A field nobody picked, whose preferred column has nothing, takes the first column that says something; a list joins
// every column's only when joining is asked for, since catalogues name the same genres differently.
export function fill_empty_choices(fields: MergeField<MergeColumn>[], columns: MergeColumn[], preferred: string, choices: MergeChoices, join_lists: boolean): MergeChoices {
  const filled = { ...choices };
  const preferred_column = columns.find((column) => column.key === preferred);
  for (const field of fields) {
    if (filled[field.id] || (field.combine && join_lists) || !preferred_column || !is_conflict(field, columns)) continue;
    const text = field.text ?? merge_text;
    const from = text(field.value(preferred_column)) !== "" ? preferred_column : columns.find((column) => text(field.value(column)) !== "");
    if (from && (from !== preferred_column || field.combine)) filled[field.id] = { kind: "value", from: from.key };
  }
  return filled;
}

// Every column of each field that disagrees, from the column that wins it or joined.
function picked_values(specs: MergeFieldSpec[], columns: MergeColumn[], preferred: string, choices: MergeChoices): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const spec of specs) {
    const field = grid_field(spec);
    if (!is_conflict(field, columns)) continue;
    const winner = winner_of(field, columns, (column) => column.key, preferred, choices);
    if (winner === "combined") {
      values[spec.columns[0]!] = spec.combine!(columns.map(field.value));
      continue;
    }
    const from = columns.find((column) => column.key === winner)!;
    for (const name of spec.columns) values[name] = from.values[name] ?? (name === spec.columns[0] ? null : "");
  }
  return values;
}

// ── Pieces ───────────────────────────────────────────────────────────────────

function ColumnCover({ file, address }: { file: string; address: string }) {
  const src = use_cover(file, address);
  return <Cover src={src} size="small" />;
}

function AddDuplicates<Item extends Tracked>({ kind, items, picked, start, on_add }: { kind: MergeKind<Item>; items: Item[]; picked: string[]; start: Item; on_add: (id: string) => void }) {
  const [query, set_query] = useState("");
  const others = items.filter((item) => !picked.includes(item.id));
  const words = query.trim().toLowerCase();
  const shown = words ? others.filter((item) => kind.name(item).toLowerCase().includes(words)).slice(0, 8) : others.filter((item) => kind.alike(item, start));
  return (
    <Section title={`Other tracked copies`}>
      <Stack>
        <SearchBox label={`Find a ${kind.noun} to merge`} value={query} on_input={set_query} />
        {shown.length === 0 ? (
          <p className="muted">{words ? `No other ${kind.noun} by that name.` : `No other ${kind.noun} looks like this one; search for one by name.`}</p>
        ) : (
          <ul className="merge-candidates">
            {shown.map((item) => (
              <li key={item.id} className="merge-candidate">
                <span>
                  <strong>{kind.name(item)}</strong> <span className="muted">{kind.detail(item)}</span>
                </span>
                <button type="button" onClick={() => on_add(item.id)}>
                  Add to merge
                </button>
              </li>
            ))}
          </ul>
        )}
      </Stack>
    </Section>
  );
}

// ── Window ───────────────────────────────────────────────────────────────────

function MergeWindow<Item extends Tracked>({ kind, start, items, close, imported }: { kind: MergeKind<Item>; start: Item; items: Item[]; close: () => void; imported?: ImportedCopy }) {
  const [picked, set_picked] = useState<string[]>([start.id]);
  // An import settles against the file alone, without asking the catalogues.
  const sources = use_resource(() => (imported ? Promise.resolve(no_sources) : kind.lookup_sources(start.id)), [start.id]);
  const [preferred, set_preferred] = useState(imported ? file_key : start.id);
  const [keep, set_keep] = useState(start.id);
  const [personal_preferred, set_personal_preferred] = useState(file_key);
  const [detail_choices, set_detail_choices] = useState<MergeChoices>({});
  const [personal_choices, set_personal_choices] = useState<MergeChoices>({});
  const [only_differences, set_only_differences] = use_pref("x-media-tracker-merge-only-differences", false, is_boolean);
  const [busy, set_busy] = useState(false);

  const tracked = picked.flatMap((id) => items.filter((item) => item.id === id));
  const tracked_columns: MergeColumn[] = tracked.map((item, index) => ({ key: item.id, label: tracked.length > 1 ? `Tracked ${index + 1}` : "Tracked", tracked: true, values: item as unknown as Record<string, unknown> }));
  const source_columns: MergeColumn[] = (sources.data?.answers ?? []).map((answer) => ({ key: `source:${answer.source}`, label: answer.label, tracked: false, values: answer.values }));
  const file_columns: MergeColumn[] = imported ? [{ key: file_key, label: "From the file", tracked: false, values: imported.values }] : [];
  const detail_columns = [...tracked_columns, ...file_columns, ...source_columns];
  const personal_columns = [...tracked_columns, ...file_columns];
  const shows_personal = tracked.length > 1 || imported !== undefined;
  const personal_survivor = imported ? personal_preferred : keep;
  const detail_specs = kind.fields.filter((spec) => !spec.personal);
  const personal_specs = kind.fields.filter((spec) => spec.personal);
  const detail_fields = detail_specs.map(grid_field);
  const personal_fields = personal_specs.map(grid_field);
  const detail_effective = fill_empty_choices(detail_fields, detail_columns, preferred, detail_choices, false);
  const personal_effective = fill_empty_choices(personal_fields, personal_columns, personal_survivor, personal_choices, true);

  const differences = detail_fields.filter((field) => is_conflict(field, detail_columns)).length + (shows_personal ? personal_fields.filter((field) => is_conflict(field, personal_columns)).length : 0);

  const heading = (column: MergeColumn) => (
    <span className="merge-heading">
      <ColumnCover {...kind.cover(column.values)} />
      <span>{column.label}</span>
    </span>
  );
  const detail_of = (column: MergeColumn) => (column.tracked ? column.key : column.key === file_key ? "From the file" : "From the catalogue");

  const merge = async () => {
    const values = { ...picked_values(detail_specs, detail_columns, preferred, detail_effective), ...(shows_personal ? picked_values(personal_specs, personal_columns, personal_survivor, personal_effective) : {}) };
    set_busy(true);
    try {
      await kind.merge(picked, keep, values);
      toast(tracked.length > 1 ? `Merged ${plural(tracked.length, kind.noun)} into one.` : `Saved the ${kind.noun}'s details.`, { tone: "good" });
      close();
      if (keep !== start.id) window.location.hash = kind.href(keep);
    } catch (error) {
      toast((error as Error).message, { tone: "bad" });
      set_busy(false);
    }
  };

  const remove = (id: string) => {
    set_picked(picked.filter((each) => each !== id));
    if (keep === id) set_keep(start.id);
    if (preferred === id) set_preferred(start.id);
  };

  const title = imported ? `Settle ${kind.name(start)} from the file (${imported.place})` : tracked.length > 1 ? `Merge ${plural(tracked.length, kind.noun)}` : `Pick ${kind.name(start)}'s details`;

  return (
    <PageView
      title={title}
      subtitle={differences > 0 ? `${plural(differences, "field")} disagree; click the value to keep in each row` : "Every field agrees"}
      on_close={close}
      class_name="merge-window"
      actions={
        <>
          <Switch label="Only differences" show_label checked={only_differences} on_change={set_only_differences} />
          {imported && (
            <>
              <button type="button" onClick={imported.skip_rest}>
                Skip the rest
              </button>
              <button type="button" onClick={close}>
                Skip
              </button>
            </>
          )}
          <button type="button" className="accent solid" disabled={busy || differences === 0} onClick={() => void merge()}>
            {busy ? "Saving…" : tracked.length > 1 ? "Merge" : "Save"}
          </button>
        </>
      }
    >
      <Stack>
        <Section title="Details">
          <Stack>
            <Loaded resource={sources} lines={2}>
              {(found) => found.failures.length > 0 && <p className="muted small">Not heard from: {found.failures.join("; ")}</p>}
            </Loaded>
            <MergeGrid
              label={`What the ${kind.noun} is`}
              items={detail_columns}
              item_key={(column) => column.key}
              item_heading={heading}
              item_detail={detail_of}
              fields={detail_fields}
              survivor={preferred}
              on_survivor_change={set_preferred}
              choices={detail_effective}
              on_choices_change={set_detail_choices}
              only_differences={only_differences}
              labels={{ survivor: "Prefer" }}
            />
          </Stack>
        </Section>
        {shows_personal && (
          <Section title="Yours">
            <Stack>
              <p className="muted small">
                {imported
                  ? `The file's episodes, reads, journal entries and collections are already added; pick what the ${kind.noun} keeps of the rest. History can bring back what it had.`
                  : "The copy marked Keep stays and the others are removed into it, with every read, episode, journal entry and collection; History can bring them back."}
              </p>
              <MergeGrid
                label={`Your tracking of the ${kind.noun}`}
                items={personal_columns}
                item_key={(column) => column.key}
                item_heading={heading}
                item_detail={(column) => (
                  <span className="merge-heading">
                    <span>{detail_of(column)}</span>
                    {column.tracked && column.key !== start.id && (
                      <button type="button" className="link" onClick={() => remove(column.key)}>
                        Leave out
                      </button>
                    )}
                  </span>
                )}
                fields={personal_fields}
                survivor={personal_survivor}
                on_survivor_change={imported ? set_personal_preferred : set_keep}
                choices={personal_effective}
                on_choices_change={set_personal_choices}
                only_differences={only_differences}
                labels={{ survivor: imported ? "Prefer" : "Keep" }}
              />
            </Stack>
          </Section>
        )}
        {!imported && <AddDuplicates kind={kind} items={items} picked={picked} start={start} on_add={(id) => set_picked([...picked, id])} />}
      </Stack>
    </PageView>
  );
}

// ── Opening ──────────────────────────────────────────────────────────────────

export function open_merge<Item extends Tracked>(kind: MergeKind<Item>, start: Item, items: Item[]): void {
  open_dialog((close) => <MergeWindow kind={kind} start={start} items={items} close={close} />);
}

// Opens the window for each conflict an import found, one after another, until all are saved or skipped.
export function settle_imported<Item extends Tracked>(kind: MergeKind<Item>, conflicts: ImportConflict[], items: Item[]): void {
  const queue = conflicts.flatMap((conflict) => {
    const start = items.find((item) => item.id === conflict.id);
    return start ? [{ start, values: conflict.values }] : [];
  });
  let stopped = false;
  const open_next = (index: number): void => {
    const next = queue[index];
    if (stopped || !next) return;
    open_dialog((close) => {
      const finish = () => {
        close();
        open_next(index + 1);
      };
      const skip_rest = () => {
        stopped = true;
        close();
      };
      return <MergeWindow kind={kind} start={next.start} items={items} close={finish} imported={{ values: next.values, place: `${index + 1} of ${queue.length}`, skip_rest }} />;
    });
  };
  open_next(0);
}

export function MergeButton<Item extends Tracked>({ kind, start, items, children = "Merge…" }: { kind: MergeKind<Item>; start: Item; items: Item[]; children?: ReactNode }) {
  return (
    <button type="button" onClick={() => open_merge(kind, start, items)}>
      {children}
    </button>
  );
}
