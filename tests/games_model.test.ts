import { describe, expect, it } from "vitest";

import { empty_game, join_results, merge_games, same_game, title_words } from "../src/shared/games/catalog.ts";
import {
  built_in_statuses,
  clean_game_statuses,
  clean_names,
  dlc_of,
  filter_games,
  find_base_game,
  game_facet_counts,
  game_key,
  game_links,
  furthest_status,
  game_status_info,
  game_status_of,
  group_status,
  is_unplayed,
  no_game_filters,
  parse_game_link,
  parse_itchio_id,
  release_day,
  sort_games,
  type GameStatusInfo,
  type LibraryGame,
} from "../src/shared/games/model.ts";
import { read_igdb_export } from "../src/shared/games/igdb_export.ts";
import { parse_steam_id, parse_steam_name } from "../src/shared/games/steam.ts";
import { read_steam_categories, steam_account_folder } from "../src/shared/games/steam_collections.ts";

function game(fields: Partial<LibraryGame>): LibraryGame {
  const status = game_status_info(built_in_statuses, fields.status ?? "backlog");
  return {
    status_label: status.label,
    status_group: status.group,
    id: "",
    other_ids: {},
    rawg_id: "",
    mobygames_id: "",
    giantbomb_id: "",
    wikidata_id: "",
    steam_app_id: "",
    igdb_id: "",
    thegamesdb_id: "",
    gog_id: "",
    steamgriddb_id: "",
    itchio_id: "",
    epic_id: "",
    cover_file: "",
    cover_file_from: "",
    cover_by_hand: false,
    title: "",
    year: "",
    release_date: "",
    overview: "",
    cover_url: "",
    genres: "",
    platforms: "",
    developers: "",
    publishers: "",
    status: "backlog",
    rating: null,
    review: "",
    notes: "",
    owned_platforms: [],
    owned_stores: [],
    edition: "",
    playtime_minutes: 0,
    last_played: "",
    added_at: "",
    base_game: "",
    base_game_title: "",
    epic_namespace: "",
    epic_app_name: "",
    gog_product_id: "",
    lutris_slug: "",
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
    expect(parse_game_link("https://www.igdb.com/games/Portal-2")).toEqual({ source: "igdb", id: "portal-2" });
    expect(parse_game_link("https://thegamesdb.net/game.php?id=41")).toEqual({ source: "thegamesdb", id: "41" });
    expect(parse_game_link("https://www.gog.com/en/game/the_witcher_3_wild_hunt")).toEqual({ source: "gog", id: "the_witcher_3_wild_hunt" });
    expect(parse_game_link("https://www.gog.com/game/doom_1993")).toEqual({ source: "gog", id: "doom_1993" });
    expect(parse_game_link("https://Innersloth.itch.io/among-us")).toEqual({ source: "itchio", id: "innersloth/among-us" });
    expect(parse_game_link("innersloth.itch.io/among-us/")).toEqual({ source: "itchio", id: "innersloth/among-us" });
    expect(parse_game_link("https://itch.io/games/free")).toBeNull();
    expect(parse_game_link("Portal 2")).toBeNull();
  });

  it("keys an itch.io game by its page", () => {
    expect(game_key({ itchio_id: "innersloth/among-us" })).toBe("itchio:innersloth/among-us");
    expect(parse_itchio_id("innersloth/among-us")).toBe("innersloth/among-us");
    expect(parse_itchio_id("https://innersloth.itch.io/among-us?ac=1")).toBe("innersloth/among-us");
    expect(parse_itchio_id("among-us")).toBe("");
  });

  it("reads a Steam profile as its id or its custom URL name", () => {
    expect(parse_steam_id("https://steamcommunity.com/profiles/76561197960287930/")).toBe("76561197960287930");
    expect(parse_steam_name("https://steamcommunity.com/id/OperationLeader/")).toBe("OperationLeader");
    expect(parse_steam_name(" OperationLeader ")).toBe("OperationLeader");
    expect(parse_steam_name("not a name!")).toBe("");
  });

  it("links to every catalogue it has an id for", () => {
    expect(game_links({ rawg_id: "portal-2", steam_app_id: "620" }).map((link) => link.label)).toEqual(["RAWG", "Steam"]);
    expect(game_links({ thegamesdb_id: "41", gog_id: "doom_1993", steamgriddb_id: "2460" }).map((link) => link.href)).toEqual([
      "https://thegamesdb.net/game.php?id=41",
      "https://www.gog.com/en/game/doom_1993",
      "https://www.steamgriddb.com/game/2460",
    ]);
    expect(game_links({ itchio_id: "innersloth/among-us" })).toEqual([{ label: "itch.io", href: "https://innersloth.itch.io/among-us" }]);
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
    game({ id: "a", title: "Hades", status: "currently_playing", owned_platforms: ["PC", "Nintendo Switch"], owned_stores: ["Steam", "Nintendo eShop"], collection_ids: ["c1"], playtime_minutes: 600, rating: 9 }),
    game({ id: "b", title: "Celeste", status: "completed", owned_platforms: ["PC"], owned_stores: ["GOG"], playtime_minutes: 300 }),
    game({ id: "c", title: "Outer Wilds", status: "wishlist" }),
  ];

  it("filters by status, platform, store and collection", () => {
    expect(filter_games(games, { ...no_game_filters, status: "completed" }).map((each) => each.id)).toEqual(["b"]);
    expect(filter_games(games, { ...no_game_filters, status: "played" }).map((each) => each.id)).toEqual(["b"]);
    expect(filter_games(games, { ...no_game_filters, status: "want_to_play" }).map((each) => each.id)).toEqual(["c"]);
    expect(filter_games(games, { ...no_game_filters, platform: "PC" }).map((each) => each.id)).toEqual(["a", "b"]);
    expect(filter_games(games, { ...no_game_filters, platform: "none" }).map((each) => each.id)).toEqual(["c"]);
    expect(filter_games(games, { ...no_game_filters, store: "GOG" }).map((each) => each.id)).toEqual(["b"]);
    expect(filter_games(games, { ...no_game_filters, store: "none" }).map((each) => each.id)).toEqual(["c"]);
    expect(filter_games(games, { ...no_game_filters, collection: "c1" }).map((each) => each.id)).toEqual(["a"]);
    expect(filter_games(games, { ...no_game_filters, search: "wild" }).map((each) => each.id)).toEqual(["c"]);
  });

  it("counts each choice narrowed by every other filter but its own", () => {
    const counts = game_facet_counts(games, { ...no_game_filters, status: "playing" });
    expect(counts.status).toEqual({ all: 3, playing: 1, currently_playing: 1, played: 1, completed: 1, want_to_play: 1, wishlist: 1 });
    expect(counts.platform).toEqual({ all: 1, PC: 1, "Nintendo Switch": 1 });
    expect(counts.store).toEqual({ all: 1, Steam: 1, "Nintendo eShop": 1 });
  });

  it("keeps DLC out of the games until asked for, and finds its base game by any id", () => {
    const base = game({ id: "rawg:portal-2", title: "Portal 2", steam_app_id: "620" });
    const extra = game({ id: "steam:323180", title: "Portal 2 Sixense Pack", base_game: "steam:620" });
    const unlinked = game({ id: "steam:1", title: "Not DLC", base_game: "none" });
    const all = [base, extra, unlinked];
    expect(filter_games(all, no_game_filters).map((each) => each.id)).toEqual(["rawg:portal-2", "steam:1"]);
    expect(filter_games(all, { ...no_game_filters, kind: "dlc" }).map((each) => each.id)).toEqual(["steam:323180"]);
    expect(game_facet_counts(all, no_game_filters).kind).toEqual({ all: 3, games: 2, dlc: 1 });
    expect(find_base_game(extra, all)?.id).toBe("rawg:portal-2");
    expect(find_base_game(unlinked, all)).toBeUndefined();
    expect(dlc_of(base, all).map((each) => each.id)).toEqual(["steam:323180"]);
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
      ["Portal 2", "finished"],
      ["Hollow Knight: Silksong", "backlog"],
      ["Deus Ex", "abandoned"],
      ["Tom & Jerry", "backlog"],
    ]);
    expect(games[0]).toMatchObject({ rating: 9, review: "Brilliant\n\nThink with portals.", platforms: ["PC"], collections: ["Couch co-op"] });
  });

  it("reads a page that is not an export as no games", () => {
    expect(read_igdb_export("<html><h1>Hello</h1></html>")).toEqual([]);
  });
});

describe("IGDB's statuses", () => {
  it("reads a status from before them as the nearest one, and anything else as Backlog", () => {
    const of = (value: string) => game_status_of(built_in_statuses, value);
    expect([of("want_to_play"), of("playing"), of("paused"), of("played"), of("dropped")]).toEqual([
      "backlog",
      "currently_playing",
      "on_hold",
      "finished",
      "abandoned",
    ]);
    expect(of("endless")).toBe("endless");
    expect(of("beaten")).toBe("backlog");
  });
});

describe("the user's statuses", () => {
  const co_op: GameStatusInfo = { id: "co-op", label: "Co-op", group: "playing" };
  // Backlog and Currently playing removed, Co-op added to Playing.
  const statuses = clean_game_statuses([...built_in_statuses.filter((each) => each.id !== "backlog" && each.id !== "currently_playing"), co_op]);

  it("keeps a stored list in group order, drops broken entries, and fills an empty group with the built-in ones", () => {
    expect(clean_game_statuses([])).toEqual(built_in_statuses);
    expect(clean_game_statuses("broken")).toEqual(built_in_statuses);
    const cleaned = clean_game_statuses([co_op, { id: "co-op", label: "Again", group: "playing" }, { id: "x", label: " ", group: "playing" }, { id: "y", label: "Y", group: "nowhere" }, { id: "done", label: " Done ", group: "played" }]);
    expect(cleaned.map((each) => each.id)).toEqual(["wishlist", "backlog", "co-op", "done"]);
    expect(cleaned.at(-1)!.label).toBe("Done");
  });

  it("starts a group at its built-in status, or its first once that is removed", () => {
    expect(group_status(built_in_statuses, "want_to_play")).toBe("backlog");
    expect(group_status(statuses, "want_to_play")).toBe("wishlist");
    expect(group_status(statuses, "playing")).toBe("on_hold");
    expect(group_status(statuses, "played")).toBe("finished");
  });

  it("reads a removed built-in status as its group's, and an unknown one as Want to play's", () => {
    expect(game_status_of(statuses, "currently_playing")).toBe("on_hold");
    expect(game_status_of(statuses, "playing")).toBe("on_hold");
    expect(game_status_of(statuses, "co-op")).toBe("co-op");
    expect(game_status_of(statuses, "gone")).toBe("wishlist");
    expect(game_status_info(statuses, "co-op")).toEqual(co_op);
    expect(is_unplayed(statuses, "gone")).toBe(true);
  });

  it("ranks a status of the user's own with its group's built-in status", () => {
    expect(furthest_status(statuses, "co-op", "wishlist")).toBe("co-op");
    expect(furthest_status(statuses, "co-op", "finished")).toBe("finished");
    expect(furthest_status(statuses, "on_hold", "co-op")).toBe("co-op");
  });
});

describe("Steam's library categories", () => {
  const entry = (key: string, value: object | null, deleted = false) => [key, { key, timestamp: 1, version: "1", ...(deleted ? { is_deleted: true } : { value: JSON.stringify(value) }) }];
  const file = JSON.stringify([
    entry("user-collections.uc-a", { id: "uc-a", name: "Finished", added: [620, 400, 620], removed: [] }),
    entry("user-collections.favorite", { id: "favorite", name: "Favorites", added: [570], removed: [] }),
    entry("user-collections.uc-b", null, true),
    entry("user-collections.uc-c", { id: "uc-c", name: "Linux native", filterSpec: { nFormatVersion: 2 } }),
    entry("showcases", { anything: true }),
  ]);

  it("reads each category's name and games, leaving out deleted and filtered ones", () => {
    expect(read_steam_categories(file)).toEqual([
      { name: "Favorites", app_ids: ["570"] },
      { name: "Finished", app_ids: ["620", "400"] },
    ]);
    expect(read_steam_categories("{broken")).toEqual([]);
  });

  it("finds a profile's userdata folder by its 64-bit id", () => {
    expect(steam_account_folder("https://steamcommunity.com/profiles/76561197960287930")).toBe("22202");
    expect(steam_account_folder("gabelogannewell")).toBe("");
  });
});
