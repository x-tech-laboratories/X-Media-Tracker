// CSV as RFC 4180 writes it, read and written: quoted fields may hold commas, quotes and line breaks.

// ── Reading ──────────────────────────────────────────────────────────────────

// Rows of cells; a leading byte-order mark and blank rows are dropped.
export function parse_csv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const source = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;
    if (quoted) {
      if (char !== '"') field += char;
      else if (source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((value) => value.trim() !== ""));
}

// Each row after the header as an object by its column's name.
export function csv_records(text: string): Record<string, string>[] {
  const [header, ...rows] = parse_csv(text);
  if (!header) return [];
  return rows.map((cells) => Object.fromEntries(header.map((name, index) => [name.trim(), cells[index] ?? ""])));
}

// ── Writing ──────────────────────────────────────────────────────────────────

function csv_field(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function write_csv(header: string[], rows: (string | number | null | undefined)[][]): string {
  return [header, ...rows].map((row) => row.map(csv_field).join(",")).join("\r\n") + "\r\n";
}
