// The games' settings and their defaults, in a file with no imports so the page can read them too.

export const games_setting_defaults = {
  // The Epic sign-in, renewed by every import, and the name of the account it belongs to.
  "games.epic_refresh_token": "",
  "games.epic_account": "",
  // The user's statuses in order, each { id, label, group }; empty is the built-in ones.
  "games.statuses": [] as { id: string; label: string; group: string }[],
  // The status a game added by hand starts with.
  "games.default_status": "backlog",
  // The status each Steam library category gives its games, by the category's name, such as { "Finished": "finished" }.
  "games.steam_category_statuses": {} as Record<string, string>,
  // The launchers a game's page offers to start it in, where the game is known to them.
  "games.launchers": ["steam", "heroic", "epic", "gog_galaxy", "lutris"] as string[],
  // The category names last read from Steam, A-Z, offered for the mapping.
  "games.steam_categories": [] as string[],
};

// Settings that hold another service's key or sign-in, kept out of what other programs read; the keys now in the Steam,
// itch.io and Epic plugins stay listed, should an old settings file bring them back before they move.
export const games_secret_settings = [
  "games.steam_api_key",
  "games.itchio_api_key",
  "games.epic_client_secret",
  "games.epic_refresh_token",
];
