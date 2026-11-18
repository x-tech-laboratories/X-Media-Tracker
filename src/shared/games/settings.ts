// The games' settings and their defaults, in a file with no imports so the page can read them too.

export const games_setting_defaults = {
  // Each catalogue's key; a catalogue without one is left out of search and details.
  "games.rawg_api_key": "",
  "games.mobygames_api_key": "",
  "games.giantbomb_api_key": "",
  // A Steam Web API key and the 64-bit id of the profile whose library and wishlist are read.
  "games.steam_api_key": "",
  "games.steam_id": "",
  // The status a game added by hand starts with.
  "games.default_status": "backlog",
  // The fewest hours between automatic Steam imports; 0 turns them off.
  "games.steam_sync_hours": 0,
  // When the last Steam import ran, as an ISO timestamp, and what it did; synced, so the server and a desktop do not both run it.
  "games.last_steam_sync": "",
  "games.last_steam_result": "",
  // The status each Steam library category gives its games, by the category's name, such as { "Finished": "finished" }.
  "games.steam_category_statuses": {} as Record<string, string>,
  // The category names last read from Steam, A-Z, offered for the mapping.
  "games.steam_categories": [] as string[],
};

// Settings that hold another service's key, kept out of what other programs read.
export const games_secret_settings = ["games.rawg_api_key", "games.mobygames_api_key", "games.giantbomb_api_key", "games.steam_api_key"];
