ALTER TABLE `games_games` ADD `thegamesdb_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `games_games` ADD `gog_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `games_games` ADD `steamgriddb_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `games_games_by_thegamesdb` ON `games_games` (`thegamesdb_id`);--> statement-breakpoint
CREATE INDEX `games_games_by_gog` ON `games_games` (`gog_id`);