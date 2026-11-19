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
  },
  {
    "name": "20261118043806_dlc",
    "statements": [
      "ALTER TABLE `games_games` ADD `base_game` text DEFAULT '' NOT NULL;",
      "ALTER TABLE `games_games` ADD `base_game_title` text DEFAULT '' NOT NULL;"
    ]
  },
  {
    "name": "20261118140650_igdb_statuses",
    "statements": [
      "-- IGDB's statuses: games on the Steam wishlist become Wishlist, the rest move to their nearest status, and the Steam wishlist collection gives way to the Wishlist status.\nUPDATE `games_games` SET `status` = 'wishlist' WHERE `status` = 'want_to_play' AND `id` IN (SELECT `game_id` FROM `games_game_collections` WHERE `collection_id` IN (SELECT `id` FROM `games_collections` WHERE lower(`name`) = 'steam wishlist'));",
      "UPDATE `games_games` SET `status` = 'backlog' WHERE `status` = 'want_to_play';",
      "UPDATE `games_games` SET `status` = 'currently_playing' WHERE `status` = 'playing';",
      "UPDATE `games_games` SET `status` = 'on_hold' WHERE `status` = 'paused';",
      "UPDATE `games_games` SET `status` = 'finished' WHERE `status` = 'played';",
      "UPDATE `games_games` SET `status` = 'abandoned' WHERE `status` = 'dropped';",
      "DELETE FROM `games_collections` WHERE lower(`name`) = 'steam wishlist';"
    ]
  },
  {
    "name": "20261118144824_cover_files",
    "statements": [
      "ALTER TABLE `games_games` ADD `cover_file` text DEFAULT '' NOT NULL;",
      "ALTER TABLE `games_games` ADD `cover_file_from` text DEFAULT '' NOT NULL;"
    ]
  },
  {
    "name": "20261119000639_notes",
    "statements": [
      "ALTER TABLE `games_games` ADD `notes` text DEFAULT '' NOT NULL;"
    ]
  },
  {
    "name": "20261119003057_catalogue_ids",
    "statements": [
      "ALTER TABLE `games_games` ADD `thegamesdb_id` text DEFAULT '' NOT NULL;",
      "ALTER TABLE `games_games` ADD `gog_id` text DEFAULT '' NOT NULL;",
      "ALTER TABLE `games_games` ADD `steamgriddb_id` text DEFAULT '' NOT NULL;",
      "CREATE INDEX `games_games_by_thegamesdb` ON `games_games` (`thegamesdb_id`);",
      "CREATE INDEX `games_games_by_gog` ON `games_games` (`gog_id`);"
    ]
  }
];
