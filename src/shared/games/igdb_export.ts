// The data export IGDB gives an account (Settings → Privacy → Download your data): one HTML page whose tables hold
// the account's lists (Want to Play, Playing, Played and any of the user's own), ratings, hypes and reviews, each game
// named only by its title. Read into the store's shapes, with no DOM, since the store runs where there is none.

// ── Imports ──────────────────────────────────────────────────────────────────

import { clean_names, type GameStatus } from "./model.ts";

// ── Shapes ───────────────────────────────────────────────────────────────────

export interface IgdbGame {
  title: string;
  status: GameStatus;
  rating: number | null;
  review: string;
  platforms: string[];
  collections: string[];
}

// ── Reading the page ─────────────────────────────────────────────────────────

const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function text_of(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, name: string) => {
      if (name.startsWith("#x") || name.startsWith("#X")) return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
      if (name.startsWith("#")) return String.fromCodePoint(Number(name.slice(1)));
      return entities[name.toLowerCase()] ?? whole;
    })
    .trim();
}

interface Section {
  heading: string;
  // Each table's rows by its header's names, for tables with a header row.
  rows: Record<string, string>[];
}

// The page as headings, each with the rows of the tables under it.
function read_sections(html: string): Section[] {
  const headings = [...html.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi)];
  return headings.map((heading, index) => {
    const end = headings[index + 1]?.index ?? html.length;
    const body = html.slice(heading.index! + heading[0].length, end);
    const rows: Record<string, string>[] = [];
    for (const table of body.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)) {
      const lines = [...table[1]!.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) => row[1]!);
      const header_at = lines.findIndex((line) => /<th[\s>]/i.test(line));
      if (header_at < 0) continue;
      const names = [...lines[header_at]!.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((cell) => text_of(cell[1]!).toLowerCase());
      for (const line of lines.slice(header_at + 1)) {
        const cells = [...line.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => text_of(cell[1]!));
        rows.push(Object.fromEntries(names.map((name, column) => [name, cells[column] ?? ""])));
      }
    }
    return { heading: text_of(heading[1]!), rows };
  });
}

// ── Meanings ─────────────────────────────────────────────────────────────────

// Later wins when a game is in several places: having played it says more than wanting to.
const status_rank: GameStatus[] = ["want_to_play", "paused", "playing", "dropped", "completed"];

const list_statuses: Record<string, GameStatus> = { "want to play": "want_to_play", playing: "playing", played: "completed" };

// An entry's own status, as IGDB's list entries name them.
const entry_statuses: Record<string, GameStatus> = {
  backlog: "want_to_play",
  "want to play": "want_to_play",
  wishlist: "want_to_play",
  "currently playing": "playing",
  playing: "playing",
  paused: "paused",
  "on hold": "paused",
  shelved: "paused",
  completed: "completed",
  finished: "completed",
  beaten: "completed",
  played: "completed",
  abandoned: "dropped",
  dropped: "dropped",
};

// IGDB rates out of 10 or, in older exports, out of 100; either becomes 1 to 10.
function rating_of(text: string): number | null {
  const value = Number.parseFloat(text);
  if (!Number.isFinite(value) || value <= 0) return null;
  const out_of_ten = value > 10 ? value / 10 : value;
  return Math.min(10, Math.max(1, Math.round(out_of_ten)));
}

// ── Reading ──────────────────────────────────────────────────────────────────

// A page that is not an IGDB export reads as no games, rather than failing.
export function read_igdb_export(html: string): IgdbGame[] {
  const games = new Map<string, IgdbGame>();
  const game_named = (title: string): IgdbGame => {
    const key = title.toLowerCase();
    let game = games.get(key);
    if (!game) games.set(key, (game = { title, status: "want_to_play", rating: null, review: "", platforms: [], collections: [] }));
    return game;
  };
  const raise = (game: IgdbGame, status: GameStatus) => {
    if (status_rank.indexOf(status) > status_rank.indexOf(game.status)) game.status = status;
  };

  for (const section of read_sections(html)) {
    const name = section.heading.toLowerCase();
    for (const row of section.rows) {
      const title = row.game?.trim();
      if (!title) continue;
      if ("position" in row) {
        const game = game_named(title);
        const from_list = list_statuses[name];
        if (!from_list) game.collections = clean_names([...game.collections, section.heading]);
        raise(game, entry_statuses[(row.status ?? "").toLowerCase()] ?? from_list ?? "want_to_play");
        if (row.platform) game.platforms = clean_names([...game.platforms, row.platform]);
      } else if ("rating" in row) {
        game_named(title).rating = rating_of(row.rating ?? "");
      } else if (name.startsWith("hypes")) {
        game_named(title);
      } else if ("text/video" in row) {
        const game = game_named(title);
        game.review = [row.title, row["text/video"]].filter(Boolean).join("\n\n");
        if (row.platform) game.platforms = clean_names([...game.platforms, row.platform]);
      }
    }
  }
  return [...games.values()];
}
