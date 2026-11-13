// The library section: the Library of tracked titles, a title's own page, and adding titles.

// ── Imports ──────────────────────────────────────────────────────────────────

import "./library.css";

import { AddTab } from "./AddTab.tsx";
import { LibraryTab } from "./LibraryTab.tsx";
import { TitleView } from "./TitleView.tsx";

export { library_settings } from "./LibrarySettings.tsx";

// ── Pages ────────────────────────────────────────────────────────────────────

export const library_pages = [
  { id: "titles", label: "Library" },
  { id: "add", label: "Add" },
];

// #/library/title/<id> is a title's page, which the sidebar does not list.
export function LibraryView({ parts }: { parts: string[] }) {
  const [page, id] = parts;
  if (page === "title" && id) return <TitleView key={id} id={decodeURIComponent(id)} />;
  if (page === "add") return <AddTab />;
  return <LibraryTab />;
}
