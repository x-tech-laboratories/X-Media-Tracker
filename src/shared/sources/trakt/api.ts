// The Trakt calls described for other programs: what each does and the arguments it takes.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { JsonSchema, MethodSpec } from "@x-tech-laboratories/x-libs/api_spec";

import { text } from "../../api_schemas.ts";

// ── Shapes ───────────────────────────────────────────────────────────────────

const history_row: JsonSchema = {
  type: "object",
  description: "One watch from lookup_trakt_history, as it gives it.",
  properties: {
    history_id: { type: "integer", description: "Trakt's id for this one play." },
    media_type: { type: "string", enum: ["movie", "episode"] },
    name: text("The movie's or show's name."),
    year: text("Its year."),
    tmdb_id: text("TMDB's id, or empty."),
    imdb_id: text("IMDb's id, or empty."),
    trakt_id: text("Trakt's id, or empty."),
    season: { type: "integer", description: "The episode's season; 0 for a movie." },
    episode: { type: "integer", description: "The episode's number; 0 for a movie." },
    watched_at: text("When it was watched, as Trakt gives it."),
    label: text("The watch in words."),
  },
  required: ["history_id", "media_type", "name", "tmdb_id", "imdb_id", "trakt_id", "season", "episode", "watched_at"],
};

// ── Calls ────────────────────────────────────────────────────────────────────

export const trakt_api = {
  get_trakt_status: {
    description: "Says whether a Trakt app is set (its Client ID, and whether a secret is set) and whether the library is signed in to Trakt.",
    params: [],
  },
  set_trakt_app: {
    description: "Sets the Client ID and Client Secret of the user's own Trakt API app, from trakt.tv/oauth/applications; an empty secret keeps the one set.",
    params: [
      { name: "client_id", schema: text("The app's Client ID.") },
      { name: "client_secret", schema: text("The app's Client Secret, or empty to keep the one set.") },
    ],
  },
  start_trakt_sign_in: {
    description: "Starts signing in to Trakt: gives a code for the user to enter at Trakt's address, and a device code to poll with.",
    params: [],
  },
  poll_trakt_sign_in: {
    description: "Checks whether the user has entered the code yet: authorized once they have, pending until then, slow_down when asked too often.",
    params: [{ name: "device_code", schema: text("The device code start_trakt_sign_in gave.") }],
  },
  sign_out_trakt: {
    description: "Forgets the Trakt sign-in; the Trakt app's Client ID and Secret stay.",
    params: [],
  },
  import_trakt: {
    description: "Imports every watched movie and every watched episode from Trakt: adds new titles and merges ones already here, never removing any.",
    params: [],
  },
  archive_trakt: {
    description:
      "Reads every list Trakt holds (watched, full history, ratings, watchlist, collection) and keeps Trakt's answers whole as an archive, then imports what was watched and the ratings. " +
      "Lists that failed are named; delete nothing from Trakt while any remain.",
    params: [],
  },
  list_trakt_archives: {
    description: "Lists the Trakt archives taken, newest first, with how many rows each list held and which failed.",
    params: [],
  },
  export_trakt_archive: {
    description: "Gives one Trakt archive whole, as Trakt sent it.",
    params: [{ name: "id", schema: text("The archive's id from list_trakt_archives.") }],
  },
  lookup_trakt_history: {
    description: "Reads Trakt's whole watch history, newest first, each watch marked captured when the library holds it (the movie watched, or that episode ticked).",
    params: [],
  },
  import_trakt_watch: {
    description: "Imports one watch from lookup_trakt_history into the library, merged with what is there.",
    params: [{ name: "row", schema: history_row }],
  },
  remove_trakt_watch: {
    description: "Removes one watch from Trakt's history for good, by its history id; refused unless the library already holds that watch. Trakt has no undo.",
    params: [{ name: "row", schema: history_row }],
  },
} satisfies Record<string, MethodSpec>;
