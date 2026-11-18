CREATE TABLE `games_collections` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `games_game_collections` (
	`game_id` text NOT NULL,
	`collection_id` text NOT NULL,
	CONSTRAINT `games_game_collections_pk` PRIMARY KEY(`game_id`, `collection_id`),
	CONSTRAINT `fk_games_game_collections_game_id_games_games_id_fk` FOREIGN KEY (`game_id`) REFERENCES `games_games`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_games_game_collections_collection_id_games_collections_id_fk` FOREIGN KEY (`collection_id`) REFERENCES `games_collections`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `games_games` (
	`id` text PRIMARY KEY,
	`rawg_id` text DEFAULT '' NOT NULL,
	`mobygames_id` text DEFAULT '' NOT NULL,
	`giantbomb_id` text DEFAULT '' NOT NULL,
	`wikidata_id` text DEFAULT '' NOT NULL,
	`steam_app_id` text DEFAULT '' NOT NULL,
	`igdb_id` text DEFAULT '' NOT NULL,
	`title` text NOT NULL,
	`year` text DEFAULT '' NOT NULL,
	`release_date` text DEFAULT '' NOT NULL,
	`overview` text DEFAULT '' NOT NULL,
	`cover_url` text DEFAULT '' NOT NULL,
	`genres` text DEFAULT '' NOT NULL,
	`platforms` text DEFAULT '' NOT NULL,
	`developers` text DEFAULT '' NOT NULL,
	`publishers` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'want_to_play' NOT NULL,
	`rating` real,
	`review` text DEFAULT '' NOT NULL,
	`owned_platforms` text DEFAULT '[]' NOT NULL,
	`edition` text DEFAULT '' NOT NULL,
	`playtime_minutes` integer DEFAULT 0 NOT NULL,
	`last_played` text DEFAULT '' NOT NULL,
	`added_at` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `games_game_collections_by_collection` ON `games_game_collections` (`collection_id`);--> statement-breakpoint
CREATE INDEX `games_games_by_rawg` ON `games_games` (`rawg_id`);--> statement-breakpoint
CREATE INDEX `games_games_by_mobygames` ON `games_games` (`mobygames_id`);--> statement-breakpoint
CREATE INDEX `games_games_by_giantbomb` ON `games_games` (`giantbomb_id`);--> statement-breakpoint
CREATE INDEX `games_games_by_wikidata` ON `games_games` (`wikidata_id`);--> statement-breakpoint
CREATE INDEX `games_games_by_steam` ON `games_games` (`steam_app_id`);