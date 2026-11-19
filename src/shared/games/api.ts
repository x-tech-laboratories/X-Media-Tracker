// The games' calls described for other programs: what each does and the arguments it takes.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { JsonSchema } from "@x-tech-laboratories/x-libs/api_spec";

import { day, id_of, json_file, text } from "../api_schemas.ts";
import { game_status_text, game_statuses } from "./model.ts";

// ── Shapes ───────────────────────────────────────────────────────────────────

const game_id: JsonSchema = { ...id_of("game"), description: 'The game\'s id, such as "rawg:portal-2" or "steam:620", as list_games gives it.' };

// Each status with the group it is in, such as "on_hold (Playing · On hold)".
const statuses_named = game_statuses.map((status) => `${status} (${game_status_text(status)})`).join(", ");

const status: JsonSchema = { type: "string", enum: [...game_statuses], description: `A status, as IGDB has them, each in a group: ${statuses_named}.` };

const source: JsonSchema = { type: "string", enum: ["rawg", "igdb", "mobygames", "giantbomb", "thegamesdb", "gog", "wikidata", "steam"], description: "Which catalogue the id is from." };

// ── Calls ────────────────────────────────────────────────────────────────────

export const games_api = {
  list_games: {
    description:
      "Lists every tracked game, sorted by title, with its catalogue ids (RAWG slug, MobyGames, Giant Bomb guid, Wikidata item, Steam app, IGDB slug, TheGamesDB, " +
      "GOG slug, SteamGridDB), " +
      "release, genres, platforms it came out on, developers, status (one of " + game_statuses.join(", ") + "), rating 1 to 10 (half stars " +
      "out of five) or null, review, the platforms a copy is owned on, edition, playtime in minutes, the day last played, the collections it is in, " +
      "and for DLC base_game, the key or id of the game it adds to (\"none\" when set as not DLC), with base_game_title; " +
      "then every game collection.",
    params: [],
  },
  get_game: {
    description: "Gives one tracked game as list_games does, or null when there is none with that id.",
    params: [{ name: "id", schema: game_id }],
  },
  search_games: {
    description:
      "Searches RAWG, IGDB, MobyGames, Giant Bomb and TheGamesDB (each only when its key is set), Steam's store, GOG and Wikidata for games by title at once, the same game from " +
      "several catalogues joined into one result, each marked with the id of the library's game when already tracked. Names any catalogue that failed or had no key.",
    params: [{ name: "query", schema: text("Words of the title, such as Portal 2.") }],
  },
  add_game: {
    description:
      "Adds a game from a catalogue by its id there, filling in what every catalogue says of it, with Wikidata linking the others, and the default status " +
      "from Settings, with SteamGridDB's art when its key is set; one already tracked only has its details refreshed. Gives back its id.",
    params: [
      { name: "source", schema: source },
      { name: "id", schema: text(
          "The id there: a RAWG or IGDB slug such as portal-2, a MobyGames number such as 51233, a Giant Bomb guid such as 3030-21662, a TheGamesDB number " +
            "such as 1234, a GOG store slug such as the_witcher_3_wild_hunt, a Wikidata item such as Q279446, or a Steam app such as 620.",
        ) },
    ],
  },
  add_game_from_link: {
    description: "Adds a game from a RAWG, IGDB, MobyGames, Giant Bomb, TheGamesDB, GOG, Wikidata or Steam store link. Gives back its id.",
    params: [{ name: "link", schema: text("Such as https://rawg.io/games/portal-2 or https://store.steampowered.com/app/620/.") }],
  },
  set_game_ids: {
    description:
      "Sets a tracked game's catalogue ids, so a game the catalogues did not match can be pointed at the right one; then fetches its details from them again. " +
      "An id left out stays as it is and an empty one is cleared; an id another tracked game already has is refused. The game keeps its own id, status, " +
      "rating, platforms and playtime. Gives back the game.",
    params: [
      { name: "id", schema: game_id },
      {
        name: "ids",
        schema: {
          type: "object",
          properties: {
            rawg_id: text("A RAWG slug or link, or empty to clear it."),
            mobygames_id: text("A MobyGames game number or link, or empty to clear it."),
            giantbomb_id: text("A Giant Bomb guid such as 3030-21662 or a link, or empty to clear it."),
            wikidata_id: text("A Wikidata item such as Q279446 or a link, or empty to clear it."),
            steam_app_id: text("A Steam app number or store link, or empty to clear it."),
            igdb_id: text("An IGDB slug or link, or empty to clear it."),
            thegamesdb_id: text("A TheGamesDB game number or link, or empty to clear it."),
            gog_id: text("A GOG store page's slug such as the_witcher_3_wild_hunt or its link, or empty to clear it."),
            steamgriddb_id: text("A SteamGridDB game number or link, or empty to clear it."),
          },
        },
      },
    ],
  },
  set_game_base: {
    description:
      "Marks a game as DLC of another game in the library, so it shows on that game's page and leaves the library's Games list; " +
      "an empty base_id marks it as not DLC, and the catalogues then stop filling one in.",
    params: [
      { name: "id", schema: game_id },
      { name: "base_id", schema: text("The id of the game it adds to, from list_games, or empty for none.") },
    ],
  },
  lookup_game_sources: {
    description:
      "Looks up what each catalogue (RAWG, IGDB, MobyGames, Giant Bomb, TheGamesDB and SteamGridDB when their keys are set, GOG, Steam and Wikidata) says of a tracked game, each answer on its own " +
      "rather than joined, with the same field names as list_games gives a game: ids, title, year, release_date, overview, cover_url, genres, platforms, developers, " +
      "publishers and, for DLC, base_game. Names any catalogue that failed. Use it to pick, field by field, which catalogue's value a game keeps through merge_games.",
    params: [{ name: "id", schema: game_id }],
  },
  merge_games: {
    description:
      "Merges tracked games that are the same game, such as one imported from Steam and one added from RAWG, into one: the game kept takes the values given, " +
      "gains every collection of the others, DLC of the others becomes DLC of it, and the others are removed; History can bring them back. Values are by " +
      "list_games' field names, such as rawg_id, steam_app_id, title, status, rating, owned_platforms or playtime_minutes, each from one of the games or from " +
      "lookup_game_sources; a field left out stays as the kept game has it. A catalogue id another tracked game outside the merge already has is refused. " +
      "With one id it only sets the values. Gives back the game kept.",
    params: [
      { name: "ids", schema: { type: "array", items: { type: "string" }, description: "Every game to merge, the kept one among them, by its id as list_games gives it." } },
      { name: "keep", schema: { ...game_id, description: "The id of the game that stays." } },
      { name: "values", schema: { type: "object", description: 'The fields the kept game takes, by name, such as {"steam_app_id": "620", "playtime_minutes": 840}.' } },
    ],
  },
  remove_game: {
    description: "Removes a game from the library; History can bring it back.",
    params: [{ name: "id", schema: game_id }],
  },
  set_game_status: {
    description: "Sets a game's status: Wishlist or Backlog to want to play it; Currently playing, On hold, Endless or Replaying while playing; Finished, Completed or Abandoned once played.",
    params: [
      { name: "id", schema: game_id },
      { name: "status", schema: status },
    ],
  },
  set_game_rating: {
    description: "Rates a game 1 to 10, shown as half stars out of five, or clears its rating with null or 0.",
    params: [
      { name: "id", schema: game_id },
      { name: "rating", schema: { type: ["number", "null"], minimum: 0, maximum: 10, description: "1 to 10, or null for none." } },
    ],
  },
  set_game_notes: {
    description: "Sets your own notes on a game, in Markdown, replacing any before; empty clears them. Notes are kept apart from any review.",
    params: [
      { name: "id", schema: game_id },
      { name: "notes", schema: text("The notes' text, in Markdown.") },
    ],
  },
  set_game_review: {
    description: "Sets a game's review, replacing any before; empty clears it.",
    params: [
      { name: "id", schema: game_id },
      { name: "review", schema: text("The review's text, in Markdown.") },
    ],
  },
  set_game_platforms: {
    description: "Sets the platforms a copy of the game is owned on, replacing the list before; an empty list means not owned.",
    params: [
      { name: "id", schema: game_id },
      { name: "platforms", schema: { type: "array", items: { type: "string" }, description: "Platform names, such as PC, PlayStation 5 or Nintendo Switch." } },
    ],
  },
  set_game_edition: {
    description: "Sets which edition of the game is owned; empty clears it.",
    params: [
      { name: "id", schema: game_id },
      { name: "edition", schema: text("Such as Game of the Year Edition.") },
    ],
  },
  set_game_playtime: {
    description: "Sets how long the game has been played, in minutes.",
    params: [
      { name: "id", schema: game_id },
      { name: "minutes", schema: { type: "number", minimum: 0, description: "Minutes played in all." } },
    ],
  },
  set_game_last_played: {
    description: "Sets the day the game was last played; empty clears it.",
    params: [
      { name: "id", schema: game_id },
      { name: "day", schema: { ...day, description: "A local day such as 2026-11-10, or empty." } },
    ],
  },
  set_game_collections: {
    description: "Puts a game in exactly the collections given, taking it out of any others.",
    params: [
      { name: "id", schema: game_id },
      { name: "collection_ids", schema: { type: "array", items: { type: "string" }, description: "Collection ids from list_games." } },
    ],
  },
  save_game_collection: {
    description: "Adds a game collection, or renames the one with the id given; a name already in use merges the two. Gives back its id.",
    params: [
      {
        name: "collection",
        schema: { type: "object", properties: { id: text("The collection's id, to rename it; leave out to add one."), name: text("Such as Couch co-op.") }, required: ["name"] },
      },
    ],
  },
  remove_game_collection: {
    description: "Removes a game collection; its games stay in the library.",
    params: [{ name: "id", schema: id_of("collection") }],
  },
  import_steam_library: {
    description:
      "Imports every game the Steam profile set in Settings owns: new ones are added, owned on PC, as Currently playing when played and Backlog when not; " +
      "ones already here take Steam's playtime and last day played when later, leave the Wishlist, and move to Currently playing once played. Needs the profile's game details public. Gives the counts added and updated.",
    params: [],
  },
  import_steam_wishlist: {
    description:
      "Imports the Steam profile's wishlist: games not yet tracked are added as Wishlist, and tracked ones in the Backlog not owned anywhere move to the " +
      "Wishlist. Gives the counts added and already tracked.",
    params: [],
  },
  run_steam_sync: {
    description: "Imports the Steam library and wishlist when the hours set in Settings have passed since the last time, or now when forced. Gives what it did, or null when it was not due.",
    params: [{ name: "force", schema: { type: "boolean", description: "True to import now whatever the schedule." } }],
  },
  import_steam_categories: {
    description:
      "Reads the categories of the Steam client's library (Steam's Web API does not give them) and gives each tracked game in a category mapped with " +
      "set_steam_category_status that category's status; a game in several mapped categories takes the one furthest along, from Wishlist to Completed. " +
      "Remembers the categories' names for the mapping. Gives the counts of categories, games changed and games in a mapped category not tracked.",
    params: [{ name: "categories_json", schema: { ...json_file, description: "The client's userdata/<account>/config/cloudstorage/cloud-storage-namespace-1.json: its whole text." } }],
  },
  set_steam_category_status: {
    description: "Maps a Steam library category, by its name, to the status its games take when the categories are imported; an empty status unmaps it.",
    params: [
      { name: "category", schema: text("The category's name in Steam, such as Finished or Favorites.") },
      { name: "status", schema: { type: "string", enum: ["", ...game_statuses], description: `A status, or empty to unmap: ${statuses_named}.` } },
    ],
  },
  import_trilium_games: {
    description:
      "Imports the Trilium Game Tracker add-on's library; adds new games and merges ones already here, never removing any. A status added in the add-on " +
      "becomes the status of its name, such as Endless, or else the nearest status by its role and a collection of its name.",
    params: [
      { name: "database_json", schema: { ...json_file, description: "The add-on's Database note: its whole JSON text." } },
      { name: "config_json", schema: { ...json_file, description: "The add-on's config.json note, for the statuses added there, or empty." } },
    ],
  },
  import_igdb_export: {
    description:
      "Imports IGDB's data export for an account: its Want to Play, Playing and Played lists as statuses (an entry's own status, such as Abandoned, " +
      "winning), its own lists as collections, and its ratings and reviews. Games are matched by title, since the export names no ids; new ones " +
      "come in with only their title until refresh_games finds them. Adds and merges, never removes.",
    params: [{ name: "html", schema: { ...json_file, description: "The export's index.html: its whole text." } }],
  },
  refresh_games: {
    description: "Starts fetching every game's details from the catalogues again, in the background; a game known only by its title is looked for on Wikidata. Gives the refresh's progress.",
    params: [],
  },
  get_games_refresh: {
    description: "Gives the progress of the last refresh of the games' details: running, done or failed, with counts.",
    params: [],
  },
};
