// Files the page reads from a picker and hands the user to save.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { ChangeEvent } from "react";

// ── Files ────────────────────────────────────────────────────────────────────

// Every file picked, then clears the picker so the same files can be picked again.
export function take_picked(event: ChangeEvent<HTMLInputElement>): File[] {
  const input = event.currentTarget;
  const files = [...(input.files ?? [])];
  input.value = "";
  return files;
}

// Hands the picked file's text on, then clears the picker so the same file can be picked again.
export async function read_picked(event: ChangeEvent<HTMLInputElement>): Promise<string | null> {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (!file) return null;
  const text = await file.text();
  input.value = "";
  return text;
}

export function save_text(file_name: string, text: string, type = "application/json"): void {
  save_file(file_name, new Blob([text], { type }));
}

export function save_file(file_name: string, file: Blob): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file_name;
  link.click();
  URL.revokeObjectURL(url);
}
