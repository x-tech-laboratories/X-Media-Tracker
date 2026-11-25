// Fields for typing ids from catalogues the plugins folder adds: one for each that is on, and one for each id the item
// already has from a catalogue that is now off.

// ── Imports ──────────────────────────────────────────────────────────────────

import { FormRow } from "@x-tech-laboratories/x-libs/web/react/layout";

import type { OtherCatalog, OtherIds } from "../shared/other_ids.ts";

// ── Fields ───────────────────────────────────────────────────────────────────

// Each catalogue to draw a field for, those that are on first, then the item's other ids from the rest.
export function other_id_catalogs(catalogs: OtherCatalog[], held: OtherIds): OtherCatalog[] {
  const on = new Set(catalogs.map((catalog) => catalog.source));
  const rest = Object.keys(held)
    .filter((source) => !on.has(source))
    .sort()
    .map((source) => ({ source, label: source }));
  return [...catalogs, ...rest];
}

// What to send for the fields drawn: each as typed, an emptied one as "" so it is cleared.
export function typed_other_ids(catalogs: OtherCatalog[], values: OtherIds): Record<string, string> {
  return Object.fromEntries(catalogs.map(({ source }) => [source, values[source] ?? ""]));
}

export function OtherIdFields({ prefix, catalogs, values, on_change }: { prefix: string; catalogs: OtherCatalog[]; values: OtherIds; on_change: (values: OtherIds) => void }) {
  return catalogs.map(({ source, label }) => (
    <FormRow key={source} label={label} id={`${prefix}-other-${source}`} hint={`Its id in ${label}`}>
      <input
        id={`${prefix}-other-${source}`}
        autoComplete="off"
        spellCheck={false}
        value={values[source] ?? ""}
        onChange={(event) => on_change({ ...values, [source]: event.currentTarget.value })}
      />
    </FormRow>
  ));
}
