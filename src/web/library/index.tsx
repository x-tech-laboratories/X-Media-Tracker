// The library section: the Library of tracked titles, a title's own page, and the results of the top bar's search.

// ── Imports ──────────────────────────────────────────────────────────────────

import "./library.css";

import { LibraryTab } from "./LibraryTab.tsx";
import { SearchView } from "./SearchView.tsx";
import { TitleView } from "./TitleView.tsx";

export { library_settings } from "./LibrarySettings.tsx";
export { SearchBar } from "./SearchView.tsx";

// ── Pages ────────────────────────────────────────────────────────────────────

export const library_pages = [{ id: "titles", label: "Library" }];

// #/library/title/<id> is a title's page and #/library/search/<words> the search's results, which the sidebar does not list.
export function LibraryView({ parts }: { parts: string[] }) {
  const [page, id] = parts;
  if (page === "title" && id) return <TitleView key={id} id={decodeURIComponent(id)} />;
  if (page === "search" && id) return <SearchView key={id} query={decodeURIComponent(id)} />;
  return <LibraryTab />;
}
