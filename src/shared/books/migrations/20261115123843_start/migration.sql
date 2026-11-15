CREATE TABLE `books_book_collections` (
	`book_id` text NOT NULL,
	`collection_id` text NOT NULL,
	CONSTRAINT `books_book_collections_pk` PRIMARY KEY(`book_id`, `collection_id`),
	CONSTRAINT `fk_books_book_collections_book_id_books_books_id_fk` FOREIGN KEY (`book_id`) REFERENCES `books_books`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_books_book_collections_collection_id_books_collections_id_fk` FOREIGN KEY (`collection_id`) REFERENCES `books_collections`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `books_books` (
	`id` text PRIMARY KEY,
	`bookbrainz_id` text DEFAULT '' NOT NULL,
	`openlibrary_id` text DEFAULT '' NOT NULL,
	`hardcover_id` text DEFAULT '' NOT NULL,
	`isbn` text DEFAULT '' NOT NULL,
	`title` text NOT NULL,
	`subtitle` text DEFAULT '' NOT NULL,
	`authors` text DEFAULT '' NOT NULL,
	`author_refs` text DEFAULT '[]' NOT NULL,
	`series` text DEFAULT '' NOT NULL,
	`series_position` text DEFAULT '' NOT NULL,
	`series_ref` text DEFAULT '' NOT NULL,
	`year` text DEFAULT '' NOT NULL,
	`release_date` text DEFAULT '' NOT NULL,
	`overview` text DEFAULT '' NOT NULL,
	`cover_url` text DEFAULT '' NOT NULL,
	`genres` text DEFAULT '' NOT NULL,
	`pages` integer DEFAULT 0 NOT NULL,
	`audio_minutes` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'want_to_read' NOT NULL,
	`rating` real,
	`review` text DEFAULT '' NOT NULL,
	`owned` integer DEFAULT 0 NOT NULL,
	`format` text DEFAULT '' NOT NULL,
	`progress` real DEFAULT 0 NOT NULL,
	`progress_unit` text DEFAULT 'pages' NOT NULL,
	`moods` text DEFAULT '' NOT NULL,
	`pace` text DEFAULT '' NOT NULL,
	`last_read` text DEFAULT '' NOT NULL,
	`added_at` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `books_collections` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `books_follows` (
	`id` text PRIMARY KEY,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`bookbrainz_id` text DEFAULT '' NOT NULL,
	`openlibrary_id` text DEFAULT '' NOT NULL,
	`hardcover_id` text DEFAULT '' NOT NULL,
	`followed_at` text DEFAULT '' NOT NULL,
	`checked_at` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `books_goals` (
	`year` text PRIMARY KEY,
	`target` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `books_journal` (
	`id` text PRIMARY KEY,
	`book_id` text NOT NULL,
	`written_on` text NOT NULL,
	`page` integer,
	`text` text NOT NULL,
	CONSTRAINT `fk_books_journal_book_id_books_books_id_fk` FOREIGN KEY (`book_id`) REFERENCES `books_books`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `books_reads` (
	`id` text PRIMARY KEY,
	`book_id` text NOT NULL,
	`started_on` text DEFAULT '' NOT NULL,
	`finished_on` text DEFAULT '' NOT NULL,
	`format` text DEFAULT '' NOT NULL,
	`dnf` integer DEFAULT 0 NOT NULL,
	CONSTRAINT `fk_books_reads_book_id_books_books_id_fk` FOREIGN KEY (`book_id`) REFERENCES `books_books`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `books_releases` (
	`id` text PRIMARY KEY,
	`follow_id` text NOT NULL,
	`title` text NOT NULL,
	`authors` text DEFAULT '' NOT NULL,
	`series` text DEFAULT '' NOT NULL,
	`series_position` text DEFAULT '' NOT NULL,
	`release_date` text DEFAULT '' NOT NULL,
	`cover_url` text DEFAULT '' NOT NULL,
	`openlibrary_id` text DEFAULT '' NOT NULL,
	`hardcover_id` text DEFAULT '' NOT NULL,
	`found_at` text DEFAULT '' NOT NULL,
	`seen` integer DEFAULT 0 NOT NULL,
	`notified_at` text DEFAULT '' NOT NULL,
	CONSTRAINT `fk_books_releases_follow_id_books_follows_id_fk` FOREIGN KEY (`follow_id`) REFERENCES `books_follows`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `books_book_collections_by_collection` ON `books_book_collections` (`collection_id`);--> statement-breakpoint
CREATE INDEX `books_books_by_bookbrainz` ON `books_books` (`bookbrainz_id`);--> statement-breakpoint
CREATE INDEX `books_books_by_openlibrary` ON `books_books` (`openlibrary_id`);--> statement-breakpoint
CREATE INDEX `books_books_by_hardcover` ON `books_books` (`hardcover_id`);--> statement-breakpoint
CREATE INDEX `books_books_by_isbn` ON `books_books` (`isbn`);--> statement-breakpoint
CREATE INDEX `books_journal_by_book` ON `books_journal` (`book_id`);--> statement-breakpoint
CREATE INDEX `books_reads_by_book` ON `books_reads` (`book_id`);--> statement-breakpoint
CREATE INDEX `books_releases_by_follow` ON `books_releases` (`follow_id`);