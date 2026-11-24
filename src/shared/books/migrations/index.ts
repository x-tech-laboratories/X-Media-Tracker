// Written by x-libs-bundle-migrations from the migration folders beside it; run it again after drizzle-kit generate.

import type { DrizzleMigration } from "@x-tech-laboratories/x-libs/drizzle";

export const migrations: DrizzleMigration[] = [
  {
    "name": "20261115123843_start",
    "statements": [
      "CREATE TABLE `books_book_collections` (\n\t`book_id` text NOT NULL,\n\t`collection_id` text NOT NULL,\n\tCONSTRAINT `books_book_collections_pk` PRIMARY KEY(`book_id`, `collection_id`),\n\tCONSTRAINT `fk_books_book_collections_book_id_books_books_id_fk` FOREIGN KEY (`book_id`) REFERENCES `books_books`(`id`) ON DELETE CASCADE,\n\tCONSTRAINT `fk_books_book_collections_collection_id_books_collections_id_fk` FOREIGN KEY (`collection_id`) REFERENCES `books_collections`(`id`) ON DELETE CASCADE\n);",
      "CREATE TABLE `books_books` (\n\t`id` text PRIMARY KEY,\n\t`bookbrainz_id` text DEFAULT '' NOT NULL,\n\t`openlibrary_id` text DEFAULT '' NOT NULL,\n\t`hardcover_id` text DEFAULT '' NOT NULL,\n\t`isbn` text DEFAULT '' NOT NULL,\n\t`title` text NOT NULL,\n\t`subtitle` text DEFAULT '' NOT NULL,\n\t`authors` text DEFAULT '' NOT NULL,\n\t`author_refs` text DEFAULT '[]' NOT NULL,\n\t`series` text DEFAULT '' NOT NULL,\n\t`series_position` text DEFAULT '' NOT NULL,\n\t`series_ref` text DEFAULT '' NOT NULL,\n\t`year` text DEFAULT '' NOT NULL,\n\t`release_date` text DEFAULT '' NOT NULL,\n\t`overview` text DEFAULT '' NOT NULL,\n\t`cover_url` text DEFAULT '' NOT NULL,\n\t`genres` text DEFAULT '' NOT NULL,\n\t`pages` integer DEFAULT 0 NOT NULL,\n\t`audio_minutes` integer DEFAULT 0 NOT NULL,\n\t`status` text DEFAULT 'want_to_read' NOT NULL,\n\t`rating` real,\n\t`review` text DEFAULT '' NOT NULL,\n\t`owned` integer DEFAULT 0 NOT NULL,\n\t`format` text DEFAULT '' NOT NULL,\n\t`progress` real DEFAULT 0 NOT NULL,\n\t`progress_unit` text DEFAULT 'pages' NOT NULL,\n\t`moods` text DEFAULT '' NOT NULL,\n\t`pace` text DEFAULT '' NOT NULL,\n\t`last_read` text DEFAULT '' NOT NULL,\n\t`added_at` text DEFAULT '' NOT NULL\n);",
      "CREATE TABLE `books_collections` (\n\t`id` text PRIMARY KEY,\n\t`name` text NOT NULL\n);",
      "CREATE TABLE `books_follows` (\n\t`id` text PRIMARY KEY,\n\t`kind` text NOT NULL,\n\t`name` text NOT NULL,\n\t`bookbrainz_id` text DEFAULT '' NOT NULL,\n\t`openlibrary_id` text DEFAULT '' NOT NULL,\n\t`hardcover_id` text DEFAULT '' NOT NULL,\n\t`followed_at` text DEFAULT '' NOT NULL,\n\t`checked_at` text DEFAULT '' NOT NULL\n);",
      "CREATE TABLE `books_goals` (\n\t`year` text PRIMARY KEY,\n\t`target` integer NOT NULL\n);",
      "CREATE TABLE `books_journal` (\n\t`id` text PRIMARY KEY,\n\t`book_id` text NOT NULL,\n\t`written_on` text NOT NULL,\n\t`page` integer,\n\t`text` text NOT NULL,\n\tCONSTRAINT `fk_books_journal_book_id_books_books_id_fk` FOREIGN KEY (`book_id`) REFERENCES `books_books`(`id`) ON DELETE CASCADE\n);",
      "CREATE TABLE `books_reads` (\n\t`id` text PRIMARY KEY,\n\t`book_id` text NOT NULL,\n\t`started_on` text DEFAULT '' NOT NULL,\n\t`finished_on` text DEFAULT '' NOT NULL,\n\t`format` text DEFAULT '' NOT NULL,\n\t`dnf` integer DEFAULT 0 NOT NULL,\n\tCONSTRAINT `fk_books_reads_book_id_books_books_id_fk` FOREIGN KEY (`book_id`) REFERENCES `books_books`(`id`) ON DELETE CASCADE\n);",
      "CREATE TABLE `books_releases` (\n\t`id` text PRIMARY KEY,\n\t`follow_id` text NOT NULL,\n\t`title` text NOT NULL,\n\t`authors` text DEFAULT '' NOT NULL,\n\t`series` text DEFAULT '' NOT NULL,\n\t`series_position` text DEFAULT '' NOT NULL,\n\t`release_date` text DEFAULT '' NOT NULL,\n\t`cover_url` text DEFAULT '' NOT NULL,\n\t`openlibrary_id` text DEFAULT '' NOT NULL,\n\t`hardcover_id` text DEFAULT '' NOT NULL,\n\t`found_at` text DEFAULT '' NOT NULL,\n\t`seen` integer DEFAULT 0 NOT NULL,\n\t`notified_at` text DEFAULT '' NOT NULL,\n\tCONSTRAINT `fk_books_releases_follow_id_books_follows_id_fk` FOREIGN KEY (`follow_id`) REFERENCES `books_follows`(`id`) ON DELETE CASCADE\n);",
      "CREATE INDEX `books_book_collections_by_collection` ON `books_book_collections` (`collection_id`);",
      "CREATE INDEX `books_books_by_bookbrainz` ON `books_books` (`bookbrainz_id`);",
      "CREATE INDEX `books_books_by_openlibrary` ON `books_books` (`openlibrary_id`);",
      "CREATE INDEX `books_books_by_hardcover` ON `books_books` (`hardcover_id`);",
      "CREATE INDEX `books_books_by_isbn` ON `books_books` (`isbn`);",
      "CREATE INDEX `books_journal_by_book` ON `books_journal` (`book_id`);",
      "CREATE INDEX `books_reads_by_book` ON `books_reads` (`book_id`);",
      "CREATE INDEX `books_releases_by_follow` ON `books_releases` (`follow_id`);"
    ]
  },
  {
    "name": "20261118135651_cover_files",
    "statements": [
      "ALTER TABLE `books_books` ADD `cover_file` text DEFAULT '' NOT NULL;",
      "ALTER TABLE `books_books` ADD `cover_file_from` text DEFAULT '' NOT NULL;"
    ]
  },
  {
    "name": "20261119000638_notes",
    "statements": [
      "ALTER TABLE `books_books` ADD `notes` text DEFAULT '' NOT NULL;"
    ]
  },
  {
    "name": "20261124225331_other_ids",
    "statements": [
      "ALTER TABLE `books_books` ADD `other_ids` text DEFAULT '{}' NOT NULL;"
    ]
  }
];
