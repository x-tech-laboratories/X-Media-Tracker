// The library section: the Library of tracked titles, a title's own page, adding titles, and importing them.

// ── Imports ──────────────────────────────────────────────────────────────────

import "./library.css";

import { ImportTab } from "../sources/ImportTab.tsx";
import { AddTab } from "./AddTab.tsx";
import { LibraryTab } from "./LibraryTab.tsx";
import { TitleView } from "./TitleView.tsx";

export { library_settings } from "./LibrarySettings.tsx";

// ── Pages ────────────────────────────────────────────────────────────────────

export const library_pages = [
  { id: "titles", label: "Library" },
  { id: "add", label: "Add" },
  { id: "import", label: "Import" },
];

// #/library/title/<id> is a title's page, which the sidebar does not list.
export function LibraryView({ parts }: { parts: string[] }) {
  const [page, id] = parts;
  if (page === "title" && id) return <TitleView key={id} id={decodeURIComponent(id)} />;
  if (page === "add") return <AddTab />;
  if (page === "import") return <ImportTab />;
  return <LibraryTab />;
}
