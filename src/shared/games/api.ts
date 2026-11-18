// The games' calls described for other programs: what each does and the arguments it takes.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { JsonSchema } from "@x-tech-laboratories/x-libs/api_spec";

import { day, id_of, json_file, text } from "../api_schemas.ts";
import { game_statuses } from "./model.ts";

// ── Shapes ───────────────────────────────────────────────────────────────────

const game_id: JsonSchema = { ...id_of("game"), description: 'The game\'s id, such as "rawg:portal-2" or "steam:620", as list_games gives it.' };

const source: JsonSchema = { type: "string", enum: ["rawg", "mobygames", "giantbomb", "wikidata", "steam"], description: "Which catalogue the id is from." };

// ── Calls ────────────────────────────────────────────────────────────────────

export const games_api = {
  list_games: {
    description:
      "Lists every tracked game, sorted by title, with its catalogue ids (RAWG slug, MobyGames, Giant Bomb guid, Wikidata item, Steam app, IGDB slug), " +
      "release, genres, platforms it came out on, developers, status (want_to_play, playing, paused, played, completed or dropped), rating 1 to 10 (half stars " +
      "out of five) or null, review, the platforms a copy is owned on, edition, playtime in minutes, the day last played and the collections it is in; " +
      "then every game collection.",
    params: [],
  },
  get_game: {
    description: "Gives one tracked game as list_games does, or null when there is none with that id.",
    params: [{ name: "id", schema: game_id }],
  },
  search_games: {
    description:
      "Searches RAWG, MobyGames and Giant Bomb (each only when its key is set), Steam's store and Wikidata for games by title at once, the same game from " +
      "several catalogues joined into one result, each marked with the id of the library's game when already tracked. Names any catalogue that failed or had no key.",
    params: [{ name: "query", schema: text("Words of the title, such as Portal 2.") }],
  },
  add_game: {
    description:
      "Adds a game from a catalogue by its id there, filling in what every catalogue says of it, with Wikidata linking the others, and the default status " +
      "from Settings; one already tracked only has its details refreshed. Gives back its id.",
    params: [
      { name: "source", schema: source },
      { name: "id", schema: text("The id there: a RAWG slug such as portal-2, a MobyGames number such as 51233, a Giant Bomb guid such as 3030-21662, a Wikidata item such as Q279446, or a Steam app such as 620.") },
    ],
  },
  add_game_from_link: {
    description: "Adds a game from a RAWG, MobyGames, Giant Bomb, Wikidata or Steam store link. Gives back its id.",
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
          },
        },
      },
    ],
  },
  remove_game: {
    description: "Removes a game from the library; History can bring it back.",
    params: [{ name: "id", schema: game_id }],
  },
  set_game_status: {
    description: "Sets a game's status.",
    params: [
      { name: "id", schema: game_id },
      { name: "status", schema: { type: "string", enum: [...game_statuses], description: "The new status." } },
    ],
  },
  set_game_rating: {
    description: "Rates a game 1 to 10, shown as half stars out of five, or clears its rating with null or 0.",
    params: [
      { name: "id", schema: game_id },
      { name: "rating", schema: { type: ["number", "null"], minimum: 0, maximum: 10, description: "1 to 10, or null for none." } },
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
      "Imports every game the Steam profile set in Settings owns: new ones are added, owned on PC, as Playing when played and Want to play when not; " +
      "ones already here take Steam's playtime and last day played when later. Needs the profile's game details public. Gives the counts added and updated.",
    params: [],
  },
  import_steam_wishlist: {
    description:
      "Imports the Steam profile's wishlist: games not yet tracked are added as Want to play, and the Steam wishlist collection is made to hold exactly the " +
      "wishlist. Gives the counts added, already tracked and removed from the collection.",
    params: [],
  },
  run_steam_sync: {
    description: "Imports the Steam library and wishlist when the hours set in Settings have passed since the last time, or now when forced. Gives what it did, or null when it was not due.",
    params: [{ name: "force", schema: { type: "boolean", description: "True to import now whatever the schedule." } }],
  },
  import_trilium_games: {
    description:
      "Imports the Trilium Game Tracker add-on's library; adds new games and merges ones already here, never removing any. A status added in the add-on " +
      "becomes the built-in status of its role and a collection of its name.",
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
