// The library calls described for other programs: what each does and the arguments it takes.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { JsonSchema, MethodSpec } from "@x-tech-laboratories/x-libs/api_spec";

import { id_of, json_file, step, text } from "../api_schemas.ts";
import { statuses } from "./model.ts";

// ── Shapes ───────────────────────────────────────────────────────────────────

const title_id: JsonSchema = { ...id_of("title"), description: 'The title\'s id, such as "tmdb:693134", as list_library gives it.' };

const media_type: JsonSchema = { type: "string", enum: ["movie", "show"], description: "Whether it is a movie or a TV show." };

const ranges: JsonSchema = {
  type: "array",
  description: "Runs of episodes, each a season and its first and last episode numbers; one episode is a run from it to itself.",
  items: {
    type: "object",
    properties: { season: { type: "integer", minimum: 1 }, from: { type: "integer", minimum: 1 }, to: { type: "integer", minimum: 1 } },
    required: ["season", "from", "to"],
  },
};

// ── Calls ────────────────────────────────────────────────────────────────────

export const library_api = {
  list_library: {
    description:
      "Lists every tracked movie and show, sorted by name, with its ids, status (planned, watching, watched or dropped), rating 1 to 10 or null, " +
      "genres, the collections it is in, and for shows the watched episodes as runs such as s01e01-e10; then every collection and collection group.",
    params: [],
  },
  get_title: {
    description: "Gives one tracked title as list_library does, or null when there is none with that id.",
    params: [{ name: "id", schema: title_id }],
  },
  search_tmdb: {
    description: "Searches TMDB for movies and shows by name, marking each result already tracked with its id here. Needs a TMDB key in Settings.",
    params: [
      { name: "query", schema: text("Words of the title, such as Dune.") },
      { name: "media_type", schema: { type: "string", enum: ["all", "movie", "show"], description: "Movies, shows, or both." } },
    ],
  },
  lookup_title_details: {
    description: "Looks up a tracked title on TMDB: its overview, genres, runtime, cast, and for a show every season's episodes with their names, summaries and air dates.",
    params: [{ name: "id", schema: title_id }],
  },
  export_library: {
    description: "Gives the whole library as the Trilium Media Tracker's Database JSON, which import_trilium_media reads back.",
    params: [],
  },
  add_title: {
    description: "Adds a movie or show from TMDB by its TMDB id, with the default status from Settings; one already tracked only has its details refreshed. Gives back its id.",
    params: [
      { name: "media_type", schema: media_type },
      { name: "tmdb_id", schema: text("TMDB's id, such as 693134.") },
    ],
  },
  add_title_from_link: {
    description: "Adds a movie or show from a TMDB or IMDb link, or a bare IMDb id such as tt15239678. Gives back its id.",
    params: [{ name: "link", schema: text("Such as https://www.themoviedb.org/tv/95396-severance or https://www.imdb.com/title/tt15239678/.") }],
  },
  remove_title: {
    description: "Removes a title from the library, with its watched episodes; History can bring it back.",
    params: [{ name: "id", schema: title_id }],
  },
  set_title_status: {
    description: "Sets a title's status; watched also sets the day last watched to today.",
    params: [
      { name: "id", schema: title_id },
      { name: "status", schema: { type: "string", enum: [...statuses], description: "The new status." } },
    ],
  },
  set_title_rating: {
    description: "Rates a title 1 to 10, or clears its rating with null or 0.",
    params: [
      { name: "id", schema: title_id },
      { name: "rating", schema: { type: ["number", "null"], minimum: 0, maximum: 10, description: "1 to 10, or null for none." } },
    ],
  },
  set_episodes_watched: {
    description: "Marks runs of a show's episodes watched or not in one change, then sets its status from its progress: none is planned, some watching, all watched. Gives back the title.",
    params: [
      { name: "id", schema: title_id },
      { name: "ranges", schema: ranges },
      { name: "watched", schema: { type: "boolean", description: "True to mark them watched, false to unmark them." } },
      { name: "total_episodes", schema: { type: "integer", minimum: 0, description: "The show's count of aired episodes when known, else 0." } },
    ],
  },
  set_title_collections: {
    description: "Sets which collections a title is in, replacing the ones it was in.",
    params: [
      { name: "id", schema: title_id },
      { name: "collection_ids", schema: { type: "array", items: { type: "string" }, description: "Collection ids from list_library." } },
    ],
  },
  save_collection: {
    description: "Adds a collection, or renames or regroups the one with the id given; a name already in use, whatever its case, merges into that one. Gives back its id.",
    params: [
      {
        name: "collection",
        schema: {
          type: "object",
          properties: {
            id: text("The collection's id when changing it; leave out to add one."),
            name: text("Such as Marvel Cinematic Universe."),
            group_id: { type: ["string", "null"], description: "The group it is in, or null for none." },
          },
          required: ["name", "group_id"],
        },
      },
    ],
  },
  remove_collection: {
    description: "Removes a collection; its titles stay in the library.",
    params: [{ name: "id", schema: id_of("collection") }],
  },
  save_collection_group: {
    description: "Adds a collection group, such as Mood or Franchise, or renames the one with the id given. Gives back its id.",
    params: [
      {
        name: "group",
        schema: { type: "object", properties: { id: text("The group's id when renaming it; leave out to add one."), name: text("Such as Franchise.") }, required: ["name"] },
      },
    ],
  },
  remove_collection_group: {
    description: "Removes a collection group; its collections stay, in no group.",
    params: [{ name: "id", schema: id_of("collection group") }],
  },
  move_collection_group: {
    description: "Moves a collection group one place earlier or later in the Library's filters.",
    params: [
      { name: "id", schema: id_of("collection group") },
      { name: "step", schema: step },
    ],
  },
  refresh_library: {
    description: "Starts fetching every title's details from TMDB again in the background, filling in missing ids and episode counts and setting each show's status from its episodes; never changes a rating or unwatches an episode. Answers at once with the refresh's progress, or with the one already running; follow it with get_library_refresh.",
    params: [],
  },
  get_library_refresh: {
    description: "Shows the latest library refresh: running, done or failed, how many titles it has done out of how many, and once done its report of titles with new details, with a new status and not found on TMDB. State none means no refresh since the server started.",
    params: [],
  },
  import_trilium_media: {
    description: "Imports the Trilium Media Tracker add-on's library; adds new titles and merges ones already here, never removing any.",
    params: [
      { name: "database_json", schema: { ...json_file, description: "The text of the add-on's Database note." } },
      { name: "groups_json", schema: text('The add-on\'s collectionGroups setting, such as {"groups":["Mood"],"assign":{"MCU":"Franchise"}}, or "" for none.') },
    ],
  },
} satisfies Record<string, MethodSpec>;
