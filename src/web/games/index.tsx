// The Games section: the Games library, a game's page and the results of the top bar's search.

// ── Imports ──────────────────────────────────────────────────────────────────

import "./games.css";

import { GameSearchView } from "./GameSearch.tsx";
import { GamesLibrary } from "./GamesLibrary.tsx";
import { GameView } from "./GameView.tsx";

export { game_settings } from "./GameSettings.tsx";
export { GameSearchBar } from "./GameSearch.tsx";

// ── Pages ────────────────────────────────────────────────────────────────────

export const games_pages = [{ id: "library", label: "Library" }];

// #/games/game/<id> is a game's page and #/games/search/<words> the search's results, which the sidebar does not list.
export function GamesView({ parts }: { parts: string[] }) {
  const [page, id] = parts;
  if (page === "game" && id) return <GameView key={id} id={decodeURIComponent(id)} />;
  if (page === "search" && id) return <GameSearchView key={id} query={decodeURIComponent(id)} />;
  return <GamesLibrary />;
}
