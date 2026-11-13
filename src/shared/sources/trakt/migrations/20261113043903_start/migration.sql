CREATE TABLE `trakt_archives` (
	`id` text PRIMARY KEY,
	`fetched_at` text NOT NULL,
	`counts` text NOT NULL,
	`failures` text NOT NULL,
	`data` text NOT NULL
);
