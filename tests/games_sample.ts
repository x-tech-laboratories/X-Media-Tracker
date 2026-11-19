// Games written straight into the table, for tests that need games without the catalogues.

import type { DatabaseSync } from "node:sqlite";

export type SampleGame = { id: string; title: string } & Record<string, string | number>;

export function insert_games(database: DatabaseSync, games: SampleGame[]): void {
  for (const game of games) {
    const columns = Object.keys(game);
    database.prepare(`INSERT INTO games_games (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`).run(...Object.values(game));
  }
}
