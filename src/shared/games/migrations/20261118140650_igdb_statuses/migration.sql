-- IGDB's statuses: games on the Steam wishlist become Wishlist, the rest move to their nearest status, and the Steam wishlist collection gives way to the Wishlist status.
UPDATE `games_games` SET `status` = 'wishlist' WHERE `status` = 'want_to_play' AND `id` IN (SELECT `game_id` FROM `games_game_collections` WHERE `collection_id` IN (SELECT `id` FROM `games_collections` WHERE lower(`name`) = 'steam wishlist'));--> statement-breakpoint
UPDATE `games_games` SET `status` = 'backlog' WHERE `status` = 'want_to_play';--> statement-breakpoint
UPDATE `games_games` SET `status` = 'currently_playing' WHERE `status` = 'playing';--> statement-breakpoint
UPDATE `games_games` SET `status` = 'on_hold' WHERE `status` = 'paused';--> statement-breakpoint
UPDATE `games_games` SET `status` = 'finished' WHERE `status` = 'played';--> statement-breakpoint
UPDATE `games_games` SET `status` = 'abandoned' WHERE `status` = 'dropped';--> statement-breakpoint
DELETE FROM `games_collections` WHERE lower(`name`) = 'steam wishlist';
