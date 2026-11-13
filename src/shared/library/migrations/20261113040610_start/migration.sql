CREATE TABLE `library_collection_groups` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `library_collections` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`group_id` text,
	CONSTRAINT `fk_library_collections_group_id_library_collection_groups_id_fk` FOREIGN KEY (`group_id`) REFERENCES `library_collection_groups`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `library_episodes` (
	`title_id` text NOT NULL,
	`season` integer NOT NULL,
	`episode` integer NOT NULL,
	`watched_at` text DEFAULT '' NOT NULL,
	CONSTRAINT `library_episodes_pk` PRIMARY KEY(`title_id`, `season`, `episode`),
	CONSTRAINT `fk_library_episodes_title_id_library_titles_id_fk` FOREIGN KEY (`title_id`) REFERENCES `library_titles`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `library_title_collections` (
	`title_id` text NOT NULL,
	`collection_id` text NOT NULL,
	CONSTRAINT `library_title_collections_pk` PRIMARY KEY(`title_id`, `collection_id`),
	CONSTRAINT `fk_library_title_collections_title_id_library_titles_id_fk` FOREIGN KEY (`title_id`) REFERENCES `library_titles`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_library_title_collections_collection_id_library_collections_id_fk` FOREIGN KEY (`collection_id`) REFERENCES `library_collections`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `library_titles` (
	`id` text PRIMARY KEY,
	`tmdb_id` text DEFAULT '' NOT NULL,
	`imdb_id` text DEFAULT '' NOT NULL,
	`trakt_id` text DEFAULT '' NOT NULL,
	`media_type` text NOT NULL,
	`name` text NOT NULL,
	`year` text DEFAULT '' NOT NULL,
	`overview` text DEFAULT '' NOT NULL,
	`poster_path` text DEFAULT '' NOT NULL,
	`genres` text DEFAULT '' NOT NULL,
	`runtime` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`rating` real,
	`last_watched` text DEFAULT '' NOT NULL,
	`total_episodes` integer DEFAULT 0 NOT NULL,
	`added_at` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `library_title_collections_by_collection` ON `library_title_collections` (`collection_id`);--> statement-breakpoint
CREATE INDEX `library_titles_by_tmdb` ON `library_titles` (`tmdb_id`);--> statement-breakpoint
CREATE INDEX `library_titles_by_imdb` ON `library_titles` (`imdb_id`);