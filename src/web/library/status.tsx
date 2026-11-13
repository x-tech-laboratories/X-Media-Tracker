// Setting a title's status from anywhere, and the menu items that do it.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { MenuItem } from "@x-tech-laboratories/x-libs/web/react/menus";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";

import { calls } from "../api.ts";
import { status_labels, statuses, type LibraryTitle, type Status } from "../../shared/library/model.ts";

// ── Status ───────────────────────────────────────────────────────────────────

export async function set_status(title: Pick<LibraryTitle, "id">, status: Status): Promise<void> {
  try {
    await calls().set_title_status(title.id, status);
  } catch (error) {
    toast((error as Error).message, { tone: "bad" });
  }
}

export function status_menu_items(title: Pick<LibraryTitle, "id" | "status">): MenuItem[] {
  return statuses.map((status) => ({ label: status_labels[status], radio: true, checked: title.status === status, run: () => void set_status(title, status) }));
}
