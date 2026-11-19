ALTER TABLE `games_games` ADD `epic_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `games_games_by_epic` ON `games_games` (`epic_id`);