import { describe, expect, it } from "vitest";

import { empty_game, join_results, merge_games, same_game, title_words } from "../src/shared/games/catalog.ts";
import {
  clean_names,
  filter_games,
  game_facet_counts,
  game_key,
  game_links,
  no_game_filters,
  parse_game_link,
  release_day,
  sort_games,
  type LibraryGame,
} from "../src/shared/games/model.ts";
import { read_igdb_export } from "../src/shared/games/igdb_export.ts";
import { parse_steam_id, parse_steam_name } from "../src/shared/games/steam.ts";
import { read_trilium_games, read_trilium_statuses } from "../src/shared/games/trilium.ts";

function game(fields: Partial<LibraryGame>): LibraryGame {
  return {
    id: "",
    rawg_id: "",
    mobygames_id: "",
    giantbomb_id: "",
    wikidata_id: "",
    steam_app_id: "",
    igdb_id: "",
    title: "",
    year: "",
    release_date: "",
    overview: "",
    cover_url: "",
    genres: "",
    platforms: "",
    developers: "",
    publishers: "",
    status: "want_to_play",
    rating: null,
    review: "",
    owned_platforms: [],
    edition: "",
    playtime_minutes: 0,
    last_played: "",
    added_at: "",
    collection_ids: [],
    ...fields,
  };
}

describe("game ids", () => {
  it("keys a game by its strongest id", () => {
    expect(game_key({ rawg_id: "portal-2", steam_app_id: "620" })).toBe("rawg:portal-2");
    expect(game_key({ mobygames_id: "51233", wikidata_id: "Q279446" })).toBe("mobygames:51233");
    expect(game_key({ steam_app_id: "620" })).toBe("steam:620");
    expect(game_key({ igdb_id: "portal-2" })).toBe("igdb:portal-2");
    expect(game_key({})).toBe("");
  });

  it("reads each catalogue's links", () => {
    expect(parse_game_link("https://rawg.io/games/Portal-2")).toEqual({ source: "rawg", id: "portal-2" });
    expect(parse_game_link("https://www.mobygames.com/game/51233/portal-2/")).toEqual({ source: "mobygames", id: "51233" });
    expect(parse_game_link("https://www.giantbomb.com/portal-2/3030-21662/")).toEqual({ source: "giantbomb", id: "3030-21662" });
    expect(parse_game_link("https://www.wikidata.org/wiki/Q279446")).toEqual({ source: "wikidata", id: "Q279446" });
    expect(parse_game_link("https://store.steampowered.com/app/620/Portal_2/")).toEqual({ source: "steam", id: "620" });
    expect(parse_game_link("Portal 2")).toBeNull();
  });

  it("reads a Steam profile as its id or its custom URL name", () => {
    expect(parse_steam_id("https://steamcommunity.com/profiles/76561197960287930/")).toBe("76561197960287930");
    expect(parse_steam_name("https://steamcommunity.com/id/OperationLeader/")).toBe("OperationLeader");
    expect(parse_steam_name(" OperationLeader ")).toBe("OperationLeader");
    expect(parse_steam_name("not a name!")).toBe("");
  });

  it("links to every catalogue it has an id for", () => {
    expect(game_links({ rawg_id: "portal-2", steam_app_id: "620" }).map((link) => link.label)).toEqual(["RAWG", "Steam"]);
  });
});

describe("joining catalogue answers", () => {
  const rawg = { ...empty_game("rawg"), rawg_id: "portal-2", title: "Portal 2", year: "2011", banner_url: "https://rawg/shot.jpg", overview: "From RAWG." };
  const steam = { ...empty_game("steam"), steam_app_id: "620", title: "Portal 2", cover_url: "https://steam/cover.jpg", cover_source: "steam" as const };

  it("takes a title alike in the same year as one game", () => {
    expect(title_words("The Witcher® 3: Wild Hunt")).toBe("witcher 3 wild hunt");
    expect(same_game(rawg, steam)).toBe(true);
    expect(same_game(rawg, { ...steam, year: "2007" })).toBe(false);
    expect(same_game(rawg, { ...rawg, rawg_id: "portal-2-remake" })).toBe(false);
  });

  it("keeps the first answer's words and the best catalogue's box art", () => {
    const moby = { ...empty_game("mobygames"), mobygames_id: "51233", title: "Portal 2", overview: "From MobyGames.", cover_url: "https://moby/box.jpg", cover_source: "mobygames" as const };
    const merged = merge_games(merge_games(rawg, steam), moby);
    expect(merged.overview).toBe("From RAWG.");
    expect(merged.cover_url).toBe("https://moby/box.jpg");
    expect(merged.sources).toEqual(["rawg", "steam", "mobygames"]);
    expect(merge_games(rawg, steam).cover_url).toBe("https://steam/cover.jpg");
  });

  it("joins lists from several catalogues, the same game once", () => {
    const other = { ...empty_game("steam"), steam_app_id: "400", title: "Portal", year: "2007" };
    expect(join_results([[rawg], [steam, other]]).map((each) => [each.rawg_id, each.steam_app_id])).toEqual([
      ["portal-2", "620"],
      ["", "400"],
    ]);
  });
});

describe("the Games library", () => {
  const games = [
    game({ id: "a", title: "Hades", status: "playing", owned_platforms: ["PC", "Nintendo Switch"], collection_ids: ["c1"], playtime_minutes: 600, rating: 9 }),
    game({ id: "b", title: "Celeste", status: "completed", owned_platforms: ["PC"], playtime_minutes: 300 }),
    game({ id: "c", title: "Outer Wilds", status: "want_to_play" }),
  ];

  it("filters by status, platform and collection", () => {
    expect(filter_games(games, { ...no_game_filters, platform: "PC" }).map((each) => each.id)).toEqual(["a", "b"]);
    expect(filter_games(games, { ...no_game_filters, platform: "none" }).map((each) => each.id)).toEqual(["c"]);
    expect(filter_games(games, { ...no_game_filters, collection: "c1" }).map((each) => each.id)).toEqual(["a"]);
    expect(filter_games(games, { ...no_game_filters, search: "wild" }).map((each) => each.id)).toEqual(["c"]);
  });

  it("counts each choice narrowed by every other filter but its own", () => {
    const counts = game_facet_counts(games, { ...no_game_filters, status: "playing" });
    expect(counts.status).toEqual({ all: 3, playing: 1, completed: 1, want_to_play: 1 });
    expect(counts.platform).toEqual({ all: 1, PC: 1, "Nintendo Switch": 1 });
  });

  it("sorts with missing values last either way", () => {
    expect(sort_games(games, "playtime_minutes", true).map((each) => each.id)).toEqual(["a", "b", "c"]);
    expect(sort_games(games, "playtime_minutes", false).map((each) => each.id)).toEqual(["b", "a", "c"]);
    expect(sort_games(games, "rating", false).map((each) => each.id)).toEqual(["a", "b", "c"]);
  });

  it("keeps a platform once whatever its case", () => {
    expect(clean_names([" PC ", "pc", "", "Switch"])).toEqual(["PC", "Switch"]);
  });

  it("reads a release given as words or part of a day", () => {
    expect(release_day("2011")).toBe("2011-01-01");
    expect(release_day("2011-04")).toBe("2011-04-01");
    expect(release_day("18 Apr, 2011")).toBe("2011-04-18");
    expect(release_day("Coming soon")).toBe("");
  });
});

describe("the Trilium Game Tracker", () => {
  const config = JSON.stringify({
    statuses: {
      entries: {
        backlog: { name: "To Play" },
        beaten: { name: "Completed" },
        "item-1": { name: "Watched Let's Play", role: "done" },
        "item-2": { name: "Endless", role: "playing" },
      },
    },
    steamApiKey: "not read",
  });

  const database = JSON.stringify({
    games: {
      "steam:620": { steamAppId: "620", igdbId: "", title: "Portal 2", status: "beaten", rating: 9, playtime: 305, lastPlayed: "2025-06-04", addedAt: "2026-07-28", collections: ["Puzzles"] },
      "steam:105600": { steamAppId: "105600", title: "Terraria", status: "item-2", playtime: 0, collections: [] },
      "igdb:x": { title: "A Let's Play", status: "item-1" },
      broken: "nonsense",
      untitled: { status: "playing" },
    },
  });

  it("reads each game, a status of the user's own as its role and a collection of its name", () => {
    const games = read_trilium_games(database, read_trilium_statuses(config));
    expect(games.map((each) => [each.title, each.status, each.collections])).toEqual([
      ["Portal 2", "completed", ["Puzzles"]],
      ["Terraria", "playing", ["Endless"]],
      ["A Let's Play", "completed", ["Watched Let's Play"]],
    ]);
    expect(games[0]).toMatchObject({ steam_app_id: "620", rating: 9, playtime_minutes: 305, last_played: "2025-06-04", added_at: "2026-07-28" });
  });

  it("reads a blank or broken file as no games", () => {
    expect(read_trilium_games("")).toEqual([]);
    expect(read_trilium_games("{not json")).toEqual([]);
    expect(read_trilium_statuses("{").backlog).toEqual({ status: "want_to_play", collection: "" });
  });
});

describe("IGDB's data export", () => {
  const row = (game: string, status = "", platform = "") => `<tr><td>0</td><td></td><td>${game}</td><td>${platform}</td><td>${status}</td></tr>`;
  const list = (name: string, rows: string[]) =>
    `<h3>${name}</h3><table class="table"><tbody><tr><td>Private</td><td>false</td></tr></tbody></table>` +
    `<table class="table"><tr><th>Position</th><th>Description</th><th>Game</th><th>Platform</th><th>Status</th></tr>${rows.join("")}</table>`;
  const page = [
    `<h1>"someone"</h1><h2>Ratings</h2><table><tr><th>Game</th><th>Rating</th><th>Created at</th><th>Updated at</th></tr><tr><td>Portal 2</td><td>85</td><td></td><td></td></tr></table>`,
    `<h2>Hypes (Following a game before it's release)</h2><table><tr><th>Game</th><th>Created at</th><th>Updated at</th></tr><tr><td>Hollow Knight: Silksong</td><td></td><td></td></tr></table>`,
    `<h2>Lists</h2>`,
    list("Want to Play", [row("Portal 2"), row("Deus Ex"), row("Tom &amp; Jerry")]),
    list("Played", [row("Portal 2", "", "PC"), row("Deus Ex", "Abandoned")]),
    list("Couch co-op", [row("Portal 2")]),
    `<h2>Reviews</h2><table><tr><th>Game</th><th>Title</th><th>Likes</th><th>Category</th><th>Platform</th><th>Created at</th><th>Updated at</th><th>Text/Video</th></tr>` +
      `<tr><td>Portal 2</td><td>Brilliant</td><td>0</td><td></td><td></td><td></td><td></td><td>Think with portals.</td></tr></table>`,
  ].join("");

  it("reads lists as statuses, own lists as collections, and ratings and reviews", () => {
    const games = read_igdb_export(page);
    expect(games.map((each) => [each.title, each.status])).toEqual([
      ["Portal 2", "played"],
      ["Hollow Knight: Silksong", "want_to_play"],
      ["Deus Ex", "dropped"],
      ["Tom & Jerry", "want_to_play"],
    ]);
    expect(games[0]).toMatchObject({ rating: 9, review: "Brilliant\n\nThink with portals.", platforms: ["PC"], collections: ["Couch co-op"] });
  });

  it("reads a page that is not an export as no games", () => {
    expect(read_igdb_export("<html><h1>Hello</h1></html>")).toEqual([]);
  });
});
