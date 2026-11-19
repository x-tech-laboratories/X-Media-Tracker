// The games' settings and their defaults, in a file with no imports so the page can read them too.

export const games_setting_defaults = {
  // A Steam Web API key and the 64-bit id of the profile whose library and wishlist are read.
  "games.steam_api_key": "",
  "games.steam_id": "",
  // An itch.io API key, which reads the games the account owns.
  "games.itchio_api_key": "",
  // The fewest hours between automatic itch.io imports; 0 turns them off.
  "games.itchio_sync_hours": 0,
  // When the last itch.io import ran, as an ISO timestamp, and what it did; synced like Steam's.
  "games.last_itchio_sync": "",
  "games.last_itchio_result": "",
  // The Epic Games launcher's client id and secret, which the Epic library is read with.
  "games.epic_client_id": "",
  "games.epic_client_secret": "",
  // The Epic sign-in, renewed by every import, and the name of the account it belongs to.
  "games.epic_refresh_token": "",
  "games.epic_account": "",
  // The fewest hours between automatic Epic imports; 0 turns them off.
  "games.epic_sync_hours": 0,
  // When the last Epic import ran, as an ISO timestamp, and what it did; synced like Steam's.
  "games.last_epic_sync": "",
  "games.last_epic_result": "",
  // The user's statuses in order, each { id, label, group }; empty is the built-in ones.
  "games.statuses": [] as { id: string; label: string; group: string }[],
  // The status a game added by hand starts with.
  "games.default_status": "backlog",
  // How big each cover is in the library's grid: "small", "medium" or "large".
  "games.grid_size": "medium",
  // The fewest hours between automatic Steam imports; 0 turns them off.
  "games.steam_sync_hours": 0,
  // When the last Steam import ran, as an ISO timestamp, and what it did; synced, so the server and a desktop do not both run it.
  "games.last_steam_sync": "",
  "games.last_steam_result": "",
  // The status each Steam library category gives its games, by the category's name, such as { "Finished": "finished" }.
  "games.steam_category_statuses": {} as Record<string, string>,
  // The launchers a game's page offers to start it in, where the game is known to them.
  "games.launchers": ["steam", "heroic", "epic", "gog_galaxy", "lutris"] as string[],
  // The category names last read from Steam, A-Z, offered for the mapping.
  "games.steam_categories": [] as string[],
};

// Settings that hold another service's key, kept out of what other programs read.
export const games_secret_settings = [
  "games.steam_api_key",
  "games.itchio_api_key",
  "games.epic_client_secret",
  "games.epic_refresh_token",
];
