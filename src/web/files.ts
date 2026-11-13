// Files the page reads from a picker and hands the user to save.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { ChangeEvent } from "react";

// ── Files ────────────────────────────────────────────────────────────────────

// Hands the picked file's text on, then clears the picker so the same file can be picked again.
export async function read_picked(event: ChangeEvent<HTMLInputElement>): Promise<string | null> {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (!file) return null;
  const text = await file.text();
  input.value = "";
  return text;
}

export function save_text(file_name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = file_name;
  link.click();
  URL.revokeObjectURL(url);
}
