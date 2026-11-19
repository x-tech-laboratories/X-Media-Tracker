ALTER TABLE `games_games` ADD `itchio_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `games_games_by_itchio` ON `games_games` (`itchio_id`);