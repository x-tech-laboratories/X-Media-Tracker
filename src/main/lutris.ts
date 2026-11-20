// Reads the games Lutris has on this computer, so a game's page can start it there without its slug typed in.

// ── Imports ──────────────────────────────────────────────────────────────────

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { LutrisGame } from "../shared/games/launch.ts";

// ── Finding ──────────────────────────────────────────────────────────────────

// Where Lutris keeps its games list, installed itself or as a Flatpak.
function lutris_databases(): string[] {
  const home = homedir();
  return [join(home, ".local", "share", "lutris", "pga.db"), join(home, ".var", "app", "net.lutris.Lutris", "data", "lutris", "pga.db")];
}

function text_of(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

// The installed games of every Lutris found here; none when Lutris is not.
export function read_local_lutris_games(): LutrisGame[] {
  return lutris_databases()
    .filter((file) => existsSync(file))
    .flatMap((file) => {
      const database = new DatabaseSync(file, { readOnly: true });
      try {
        return (database.prepare("SELECT * FROM games WHERE installed = 1").all() as Record<string, unknown>[]).map((row) => ({
          slug: text_of(row.slug),
          name: text_of(row.name),
          service: text_of(row.service),
          service_id: text_of(row.service_id),
        }));
      } catch {
        return [];
      } finally {
        database.close();
      }
    })
    .filter((game) => game.slug);
}
