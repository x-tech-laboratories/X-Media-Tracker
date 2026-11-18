// Written by x-libs-bundle-migrations from the migration folders beside it; run it again after drizzle-kit generate.

import type { DrizzleMigration } from "@x-tech-laboratories/x-libs/drizzle";

export const migrations: DrizzleMigration[] = [
  {
    "name": "20261117234912_start",
    "statements": [
      "CREATE TABLE `games_collections` (\n\t`id` text PRIMARY KEY,\n\t`name` text NOT NULL\n);",
      "CREATE TABLE `games_game_collections` (\n\t`game_id` text NOT NULL,\n\t`collection_id` text NOT NULL,\n\tCONSTRAINT `games_game_collections_pk` PRIMARY KEY(`game_id`, `collection_id`),\n\tCONSTRAINT `fk_games_game_collections_game_id_games_games_id_fk` FOREIGN KEY (`game_id`) REFERENCES `games_games`(`id`) ON DELETE CASCADE,\n\tCONSTRAINT `fk_games_game_collections_collection_id_games_collections_id_fk` FOREIGN KEY (`collection_id`) REFERENCES `games_collections`(`id`) ON DELETE CASCADE\n);",
      "CREATE TABLE `games_games` (\n\t`id` text PRIMARY KEY,\n\t`rawg_id` text DEFAULT '' NOT NULL,\n\t`mobygames_id` text DEFAULT '' NOT NULL,\n\t`giantbomb_id` text DEFAULT '' NOT NULL,\n\t`wikidata_id` text DEFAULT '' NOT NULL,\n\t`steam_app_id` text DEFAULT '' NOT NULL,\n\t`igdb_id` text DEFAULT '' NOT NULL,\n\t`title` text NOT NULL,\n\t`year` text DEFAULT '' NOT NULL,\n\t`release_date` text DEFAULT '' NOT NULL,\n\t`overview` text DEFAULT '' NOT NULL,\n\t`cover_url` text DEFAULT '' NOT NULL,\n\t`genres` text DEFAULT '' NOT NULL,\n\t`platforms` text DEFAULT '' NOT NULL,\n\t`developers` text DEFAULT '' NOT NULL,\n\t`publishers` text DEFAULT '' NOT NULL,\n\t`status` text DEFAULT 'want_to_play' NOT NULL,\n\t`rating` real,\n\t`review` text DEFAULT '' NOT NULL,\n\t`owned_platforms` text DEFAULT '[]' NOT NULL,\n\t`edition` text DEFAULT '' NOT NULL,\n\t`playtime_minutes` integer DEFAULT 0 NOT NULL,\n\t`last_played` text DEFAULT '' NOT NULL,\n\t`added_at` text DEFAULT '' NOT NULL\n);",
      "CREATE INDEX `games_game_collections_by_collection` ON `games_game_collections` (`collection_id`);",
      "CREATE INDEX `games_games_by_rawg` ON `games_games` (`rawg_id`);",
      "CREATE INDEX `games_games_by_mobygames` ON `games_games` (`mobygames_id`);",
      "CREATE INDEX `games_games_by_giantbomb` ON `games_games` (`giantbomb_id`);",
      "CREATE INDEX `games_games_by_wikidata` ON `games_games` (`wikidata_id`);",
      "CREATE INDEX `games_games_by_steam` ON `games_games` (`steam_app_id`);"
    ]
  }
];
