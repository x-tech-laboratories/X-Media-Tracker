// Written by x-libs-bundle-migrations from the migration folders beside it; run it again after drizzle-kit generate.

import type { DrizzleMigration } from "@x-tech-laboratories/x-libs/drizzle";

export const migrations: DrizzleMigration[] = [
  {
    "name": "20261113040610_start",
    "statements": [
      "CREATE TABLE `library_collection_groups` (\n\t`id` text PRIMARY KEY,\n\t`name` text NOT NULL,\n\t`position` integer DEFAULT 0 NOT NULL\n);",
      "CREATE TABLE `library_collections` (\n\t`id` text PRIMARY KEY,\n\t`name` text NOT NULL,\n\t`group_id` text,\n\tCONSTRAINT `fk_library_collections_group_id_library_collection_groups_id_fk` FOREIGN KEY (`group_id`) REFERENCES `library_collection_groups`(`id`) ON DELETE SET NULL\n);",
      "CREATE TABLE `library_episodes` (\n\t`title_id` text NOT NULL,\n\t`season` integer NOT NULL,\n\t`episode` integer NOT NULL,\n\t`watched_at` text DEFAULT '' NOT NULL,\n\tCONSTRAINT `library_episodes_pk` PRIMARY KEY(`title_id`, `season`, `episode`),\n\tCONSTRAINT `fk_library_episodes_title_id_library_titles_id_fk` FOREIGN KEY (`title_id`) REFERENCES `library_titles`(`id`) ON DELETE CASCADE\n);",
      "CREATE TABLE `library_title_collections` (\n\t`title_id` text NOT NULL,\n\t`collection_id` text NOT NULL,\n\tCONSTRAINT `library_title_collections_pk` PRIMARY KEY(`title_id`, `collection_id`),\n\tCONSTRAINT `fk_library_title_collections_title_id_library_titles_id_fk` FOREIGN KEY (`title_id`) REFERENCES `library_titles`(`id`) ON DELETE CASCADE,\n\tCONSTRAINT `fk_library_title_collections_collection_id_library_collections_id_fk` FOREIGN KEY (`collection_id`) REFERENCES `library_collections`(`id`) ON DELETE CASCADE\n);",
      "CREATE TABLE `library_titles` (\n\t`id` text PRIMARY KEY,\n\t`tmdb_id` text DEFAULT '' NOT NULL,\n\t`imdb_id` text DEFAULT '' NOT NULL,\n\t`trakt_id` text DEFAULT '' NOT NULL,\n\t`media_type` text NOT NULL,\n\t`name` text NOT NULL,\n\t`year` text DEFAULT '' NOT NULL,\n\t`overview` text DEFAULT '' NOT NULL,\n\t`poster_path` text DEFAULT '' NOT NULL,\n\t`genres` text DEFAULT '' NOT NULL,\n\t`runtime` integer DEFAULT 0 NOT NULL,\n\t`status` text DEFAULT 'planned' NOT NULL,\n\t`rating` real,\n\t`last_watched` text DEFAULT '' NOT NULL,\n\t`total_episodes` integer DEFAULT 0 NOT NULL,\n\t`added_at` text DEFAULT '' NOT NULL\n);",
      "CREATE INDEX `library_title_collections_by_collection` ON `library_title_collections` (`collection_id`);",
      "CREATE INDEX `library_titles_by_tmdb` ON `library_titles` (`tmdb_id`);",
      "CREATE INDEX `library_titles_by_imdb` ON `library_titles` (`imdb_id`);"
    ]
  }
];
