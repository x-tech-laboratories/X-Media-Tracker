// The store side: runs on the server and in the desktop app. It provides one game catalogue, ShelfDB, which keeps its
// ids in other_ids under its own name. No build step: the plugin needs nothing the app does not hand it.

import { manifest } from "./manifest.js";

// A game as the store wants it, every field there; a catalogue fills in what it knows.
const blank = {
  sources: ["shelfdb"],
  other_ids: {},
  rawg_id: "", mobygames_id: "", giantbomb_id: "", wikidata_id: "", steam_app_id: "", igdb_id: "",
  thegamesdb_id: "", gog_id: "", steamgriddb_id: "", itchio_id: "", epic_id: "",
  title: "", year: "", release_date: "", overview: "", cover_url: "", cover_source: "", banner_url: "",
  genres: "", platforms: "", developers: "", publishers: "", base_game: "", base_game_title: "", gog_product_id: "",
};

const games = {
  1: { title: "Outer Wilds", year: "2019", genres: "Adventure", developers: "Mobius Digital", overview: "An open-world mystery about a solar system stuck in a time loop." },
  2: { title: "Tunic", year: "2022", genres: "Action adventure", developers: "Andrew Shouldice", overview: "A fox explores a ruined land with a manual written in a language you cannot read." },
  3: { title: "Hades", year: "2020", genres: "Roguelike", developers: "Supergiant Games", overview: "Fight out of the underworld, again and again." },
};

function game(id) {
  const found = games[id];
  if (!found) throw new Error(`ShelfDB has no game ${id}.`);
  return { ...blank, ...found, other_ids: { shelfdb: id } };
}

export default {
  ...manifest,
  start: (context) => {
    context.provide("game_catalog", "shelfdb", {
      // The name its ids are kept under in other_ids; pick one no built-in catalogue uses.
      source: "shelfdb",
      label: "ShelfDB",
      // Why it cannot be asked now, such as "no key set"; empty when it can.
      missing: "",
      // When adding or refreshing a game asks it: "ids", "details" or "art".
      stage: "details",
      game: async (id) => game(id),
      search: async (query) => Object.keys(games).filter((id) => games[id].title.toLowerCase().includes(query.toLowerCase())).map(game),
    });
  },
};
