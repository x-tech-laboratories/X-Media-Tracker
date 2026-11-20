import { DatabaseSync } from "node:sqlite";

import { migrate } from "@x-tech-laboratories/x-libs/sql";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { games_feature } from "../src/shared/games/store.ts";
import { hidden_secret } from "@x-tech-laboratories/x-libs/plugins";

import { without_secret_settings } from "../src/shared/settings.ts";
import { bind_methods, open_store, secret_settings } from "../src/shared/store.ts";
import { insert_games, type SampleGame } from "./games_sample.ts";

// ── Catalogue stand-ins ──────────────────────────────────────────────────────

const portal_item = {
  labels: { mul: { value: "Portal 2" } },
  descriptions: { en: { value: "2011 puzzle game" } },
  claims: {
    P9968: [{ rank: "normal", mainsnak: { datavalue: { value: "portal-2" } } }],
    P11688: [{ rank: "normal", mainsnak: { datavalue: { value: "51233" } } }],
    P1733: [{ rank: "normal", mainsnak: { datavalue: { value: "620" } } }],
    P577: [{ rank: "normal", mainsnak: { datavalue: { value: { time: "+2011-04-18T00:00:00Z", precision: 11 } } } }],
    P400: [{ rank: "normal", mainsnak: { datavalue: { value: { id: "Q1406" } } } }],
  },
};

// Answers by host and path, and for Wikidata by what it was asked.
let answers: Record<string, unknown> = {};
let owned: unknown[] = [];
let wished: unknown[] = [];
// itch.io's owned keys, a page each.
let itch_pages: unknown[][] = [];
// Epic's library records, a page each, and whether its sign-in refuses.
let epic_pages: unknown[][] = [];
let epic_refuses = false;
let store_down = false;

// Older games keep their art as portrait.png, newer ones in a folder named by a hash.
function assets_of(appid: number) {
  const file = appid === 400 ? { library_capsule: "portrait.png" } : { library_capsule: "abc/library_capsule.jpg", library_capsule_2x: "abc/library_capsule_2x.jpg" };
  return { asset_url_format: `steam/apps/${appid}/\${FILENAME}?t=1`, ...file };
}

function base_answers(): Record<string, unknown> {
  return {
    "wikidata:search:haswbstatement:\"P1733=620\"": { query: { search: [{ title: "Q279446" }] } },
    "wikidata:search:haswbstatement:\"P9968=portal-2\"": { query: { search: [{ title: "Q279446" }] } },
    "wikidata:search:haswbstatement:P31=Q7889 portal": { query: { search: [{ title: "Q279446" }] } },
    "wikidata:entities:Q279446": { entities: { Q279446: portal_item } },
    "wikidata:entities:Q1406": { entities: { Q1406: { labels: { en: { value: "Microsoft Windows" } } } } },
    "api.rawg.io/api/games/portal-2": {
      slug: "portal-2",
      name: "Portal 2",
      released: "2011-04-18",
      description_raw: "Think with portals.",
      background_image: "https://rawg/shot.jpg",
      genres: [{ name: "Puzzle" }],
      platforms: [{ platform: { name: "PC" } }],
      developers: [{ name: "Valve Software" }],
    },
    "api.rawg.io/api/games": { results: [{ slug: "portal-2", name: "Portal 2", released: "2011-04-18", background_image: "https://rawg/shot.jpg" }] },
    "store.steampowered.com/api/appdetails": {
      "323180": { success: true, data: { type: "dlc", name: "Portal 2 Sixense Pack", fullgame: { appid: "620", name: "Portal 2" } } },
      "620": { success: true, data: { name: "Portal 2", short_description: "The &quot;Perpetual Testing Initiative&quot;", release_date: { date: "18 Apr, 2011" }, genres: [{ description: "Action" }] } },
    },
    "store.steampowered.com/api/storesearch/": { items: [{ type: "app", id: 620, name: "Portal 2", platforms: { windows: true } }] },
    "catalog.gog.com/v1/catalog": { products: [] },
  };
}

function answer_of(url: URL): unknown {
  if (url.host === "www.wikidata.org") {
    const action = url.searchParams.get("action");
    if (action === "query") return answers[`wikidata:search:${url.searchParams.get("srsearch")}`] ?? { query: { search: [] } };
    if (action === "wbgetentities") return answers[`wikidata:entities:${url.searchParams.get("ids")}`] ?? { entities: {} };
  }
  if (url.pathname === "/IPlayerService/GetOwnedGames/v1/") return { response: { game_count: owned.length, games: owned } };
  if (url.pathname === "/IWishlistService/GetWishlist/v1/") return { response: { items: wished } };
  if (url.host === "api.itch.io" && url.pathname === "/profile/owned-keys") return { owned_keys: itch_pages[Number(url.searchParams.get("page")) - 1] ?? [] };
  if (url.host === "account-public-service-prod03.ol.epicgames.com") return epic_refuses ? undefined : { access_token: "epic-access", refresh_token: `refresh-${fetch_stub.mock.calls.length}`, displayName: "Player One" };
  if (url.host === "library-service.live.use1a.on.epicgames.com") {
    const page = Number(url.searchParams.get("cursor") ?? 0);
    return { records: epic_pages[page] ?? [], responseMetadata: page + 1 < epic_pages.length ? { nextCursor: String(page + 1) } : {} };
  }
  if (url.pathname === "/IStoreBrowseService/GetItems/v1/") {
    if (store_down) return undefined;
    const ids = (JSON.parse(url.searchParams.get("input_json")!) as { ids: { appid: number }[] }).ids;
    return { response: { store_items: ids.map(({ appid }) => ({ appid, name: `Wished ${appid}`, release: { steam_release_date: 1_800_000_000 }, assets: assets_of(appid) })) } };
  }
  return answers[`${url.host}${url.pathname}`];
}

const fetch_stub = vi.fn(async (address: string) => {
  const answer = answer_of(new URL(address));
  if (answer instanceof Blob) return new Response(answer, { status: 200 });
  // A page, such as a store page, is answered as its text.
  if (typeof answer === "string") return new Response(answer, { status: 200 });
  if (answer) return new Response(JSON.stringify(answer), { status: 200 });
  return new Response("{}", { status: 404 });
});

beforeEach(() => {
  answers = base_answers();
  owned = [];
  wished = [];
  itch_pages = [];
  epic_pages = [];
  epic_refuses = false;
  store_down = false;
  fetch_stub.mockClear();
  vi.stubGlobal("fetch", fetch_stub);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 17, 12, 0));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function open_methods(games: SampleGame[] = []) {
  const database = new DatabaseSync(":memory:");
  open_store(database);
  insert_games(database, games);
  return bind_methods(() => database, () => undefined);
}

// Sets catalogue plugins' settings, such as { rawg: { api_key: "rawg-key" } }, leaving the others' as they were.
function set_plugin_settings(methods: ReturnType<typeof open_methods>, settings: Record<string, Record<string, string>>): void {
  const records = (methods.get_settings().plugins ?? {}) as Record<string, { settings?: Record<string, string> }>;
  for (const [id, values] of Object.entries(settings)) records[`x-media-tracker.${id}`] = { ...records[`x-media-tracker.${id}`], settings: { ...records[`x-media-tracker.${id}`]?.settings, ...values } };
  methods.set_setting("plugins", records);
}

function requested(part: string): string[] {
  return fetch_stub.mock.calls.map(([address]) => String(address)).filter((address) => address.includes(part));
}

// ── Adding ───────────────────────────────────────────────────────────────────

describe("adding a game", () => {
  it("links the catalogues through Wikidata and takes each one's best", async () => {
    const methods = open_methods();
    set_plugin_settings(methods, { rawg: { api_key: "rawg-key" } });
    const added = await methods.add_game("steam", "620");
    expect(added).toEqual({ id: "rawg:portal-2", title: "Portal 2", existed: false });
    const game = methods.get_game("rawg:portal-2")!;
    expect(game).toMatchObject({
      rawg_id: "portal-2",
      mobygames_id: "51233",
      wikidata_id: "Q279446",
      steam_app_id: "620",
      title: "Portal 2",
      release_date: "2011-04-18",
      overview: "Think with portals.",
      genres: "Puzzle",
      developers: "Valve Software",
      status: "backlog",
      added_at: "2026-11-17",
    });
    // Steam's upright library art beats RAWG's wide screenshot.
    expect(game.cover_url).toBe("https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/620/abc/library_capsule_2x.jpg?t=1");
  });

  it("leaves out a catalogue without a key and never sends a key it does not have", async () => {
    const methods = open_methods();
    await methods.add_game("steam", "620");
    expect(requested("api.rawg.io")).toEqual([]);
    expect(methods.get_game("rawg:portal-2")!.overview).toBe('The "Perpetual Testing Initiative"');
  });

  it("finds a game already tracked by any shared id", async () => {
    const methods = open_methods();
    await methods.add_game("steam", "620");
    expect(await methods.add_game_from_link("https://www.wikidata.org/wiki/Q279446")).toEqual({ id: "rawg:portal-2", title: "Portal 2", existed: true });
    expect(methods.list_games().games).toHaveLength(1);
  });

  it("refuses what is not a link it knows", () => {
    const methods = open_methods();
    expect(() => methods.add_game_from_link("https://example.org/portal")).toThrow("Not a RAWG");
  });

  it("names the catalogues searched without a key", async () => {
    const methods = open_methods();
    await methods.add_game("steam", "620");
    const search = await methods.search_games("portal");
    expect(search.failures).toEqual(["RAWG: no key set", "IGDB: no key set", "MobyGames: no key set", "Giant Bomb: no key set", "TheGamesDB: no key set"]);
    expect(search.results.map((result) => [result.title, result.wikidata_id, result.steam_app_id, result.tracked_id])).toEqual([["Portal 2", "Q279446", "620", "rawg:portal-2"]]);
  });
});

describe("IGDB, TheGamesDB, GOG and SteamGridDB", () => {
  const igdb_portal = {
    name: "Portal 2",
    slug: "portal-2",
    summary: "Sequel to Portal.",
    first_release_date: 1_303_084_800,
    cover: { image_id: "co1rs4" },
    genres: [{ name: "Puzzle" }],
    platforms: [{ name: "PC (Microsoft Windows)" }],
    involved_companies: [
      { developer: true, publisher: false, company: { name: "Valve" } },
      { developer: false, publisher: true, company: { name: "Electronic Arts" } },
    ],
    external_games: [{ uid: "620", external_game_source: 1 }],
  };

  const thegamesdb_answer = (games: unknown[]) => ({
    code: 200,
    data: { count: games.length, games },
    include: {
      boxart: { base_url: { large: "https://cdn.thegamesdb.net/images/large/" }, data: { "41": [{ side: "front", filename: "boxart/front/41-1.jpg" }] } },
      platform: { data: { "1": { id: 1, name: "PC" }, "12": { id: 12, name: "PlayStation 3" } } },
    },
  });

  beforeEach(() => {
    Object.assign(answers, {
      "id.twitch.tv/oauth2/token": { access_token: "twitch-access", expires_in: 3600 },
      "api.igdb.com/v4/games": [igdb_portal],
      "api.thegamesdb.net/v1/Genres": { code: 200, data: { genres: { "5": { id: 5, name: "Puzzle" } } } },
      "api.thegamesdb.net/v1/Developers": { code: 200, data: { developers: { "9": { id: 9, name: "Valve" } } } },
      "api.thegamesdb.net/v1/Publishers": { code: 200, data: { publishers: {} } },
      "api.thegamesdb.net/v1.1/Games/ByGameName": thegamesdb_answer([
        { id: 41, game_title: "Portal 2", release_date: "2011-04-19", platform: 1, genres: [5], developers: [9] },
        { id: 42, game_title: "Portal 2", release_date: "2011-04-19", platform: 12, genres: [5], developers: [9] },
      ]),
      "api.thegamesdb.net/v1/Games/ByGameID": thegamesdb_answer([{ id: 77, game_title: "Lone Island", release_date: "1994-03-01", platform: 1, overview: "A small game." }]),
      "www.steamgriddb.com/api/v2/search/autocomplete/Lone%20Island": { success: true, data: [{ id: 900, name: "Lone Island", release_date: 762_480_000 }] },
      "www.steamgriddb.com/api/v2/games/id/900": { success: true, data: { id: 900, name: "Lone Island", release_date: 762_480_000 } },
      "www.steamgriddb.com/api/v2/grids/game/900": { success: true, data: [{ url: "https://cdn2.steamgriddb.com/grid/lone.png" }] },
    });
  });

  it("searches IGDB and TheGamesDB with their keys, joining the same game and its platforms", async () => {
    const methods = open_methods();
    set_plugin_settings(methods, { igdb: { client_id: "twitch-app", client_secret: "twitch-secret" }, thegamesdb: { api_key: "tgdb-key" } });
    const search = await methods.search_games("portal");
    expect(search.failures).toEqual(["RAWG: no key set", "MobyGames: no key set", "Giant Bomb: no key set"]);
    const [portal] = search.results;
    expect(portal).toMatchObject({ title: "Portal 2", igdb_id: "portal-2", steam_app_id: "620", thegamesdb_id: "41", developers: "Valve", publishers: "Electronic Arts" });
    expect(portal!.sources).toEqual(expect.arrayContaining(["igdb", "thegamesdb", "steam", "wikidata"]));
    expect(portal!.cover_url).toBe("https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co1rs4.jpg");
    const igdb_call = fetch_stub.mock.calls.find(([address]) => String(address).includes("api.igdb.com")) as unknown as [string, RequestInit];
    expect(igdb_call[1].headers).toMatchObject({ "Client-ID": "twitch-app", Authorization: "Bearer twitch-access" });
  });

  it("joins TheGamesDB's entries for each platform into one", async () => {
    const methods = open_methods();
    set_plugin_settings(methods, { thegamesdb: { api_key: "tgdb-key" } });
    const search = await methods.search_games("portal");
    expect(search.results.filter((result) => result.thegamesdb_id)).toHaveLength(1);
    expect(search.results.find((result) => result.thegamesdb_id)!.platforms).toContain("PlayStation 3");
  });

  it("adds a game from TheGamesDB and finds SteamGridDB's art by its title", async () => {
    const methods = open_methods();
    set_plugin_settings(methods, { thegamesdb: { api_key: "tgdb-key" }, steamgriddb: { api_key: "sgdb-key" } });
    const added = await methods.add_game_from_link("https://thegamesdb.net/game.php?id=77");
    expect(added).toMatchObject({ id: "thegamesdb:77", title: "Lone Island" });
    expect(methods.get_game("thegamesdb:77")).toMatchObject({ steamgriddb_id: "900", overview: "A small game.", platforms: "PC", cover_url: "https://cdn2.steamgriddb.com/grid/lone.png" });
  });

  it("adds a GOG game from its store link", async () => {
    answers["www.gog.com/en/game/lone_island"] = '<div card-product="1234">';
    answers["api.gog.com/v2/games/1234"] = {
      description: "<p>Island <b>life</b>.</p>",
      _links: { boxArtImage: { href: "https://images.gog-statics.com/box.jpg" } },
      _embedded: { productType: "GAME", product: { title: "Lone Island", globalReleaseDate: "1994-03-01T00:00:00+02:00" }, developers: [{ name: "Islanders" }], tags: [{ name: "Adventure", level: 1 }] },
    };
    const methods = open_methods();
    expect(await methods.add_game_from_link("https://www.gog.com/en/game/lone_island")).toMatchObject({ id: "gog:lone_island", title: "Lone Island" });
    expect(methods.get_game("gog:lone_island")).toMatchObject({
      overview: "Island life.",
      release_date: "1994-03-01",
      genres: "Adventure",
      developers: "Islanders",
      cover_url: "https://images.gog-statics.com/box.jpg",
      gog_product_id: "1234",
    });
  });
});

// ── Keeping ──────────────────────────────────────────────────────────────────

describe("DLC", () => {
  it("takes the base game Steam names, and keeps one set by hand", async () => {
    const methods = open_methods();
    await methods.add_game("rawg", "portal-2");
    await methods.add_game("steam", "323180");
    expect(methods.get_game("steam:323180")).toMatchObject({ base_game: "steam:620", base_game_title: "Portal 2" });

    methods.set_game_base("steam:323180", "");
    await methods.add_game("steam", "323180");
    expect(methods.get_game("steam:323180")).toMatchObject({ base_game: "none", base_game_title: "" });

    methods.set_game_base("steam:323180", "rawg:portal-2");
    expect(methods.get_game("steam:323180")).toMatchObject({ base_game: "rawg:portal-2", base_game_title: "Portal 2" });
    expect(() => methods.set_game_base("rawg:portal-2", "rawg:portal-2")).toThrow("itself");
  });
});

describe("IGDB's statuses", () => {
  it("move older statuses to their nearest, Steam's wishlist to Wishlist, and drop the Steam wishlist collection", async () => {
    const database = new DatabaseSync(":memory:");
    open_store(database);
    const methods = bind_methods(() => database, () => undefined);
    await methods.add_game("steam", "620");
    database.exec("INSERT INTO games_games (id, steam_app_id, title) VALUES ('steam:400', '400', 'Portal')");
    const wishlist = methods.save_game_collection({ name: "Steam wishlist" });
    const favourites = methods.save_game_collection({ name: "Favourites" });
    methods.set_game_collections("steam:400", [wishlist, favourites]);
    const set_status = database.prepare("UPDATE games_games SET status = ? WHERE id = ?");
    set_status.run("paused", "rawg:portal-2");
    set_status.run("want_to_play", "steam:400");
    expect(methods.get_game("rawg:portal-2")!.status).toBe("on_hold");
    // Runs the statuses step again on its own, as on a database from before it.
    database.exec("UPDATE schema_versions SET version = 2 WHERE owner = 'games'");
    migrate(database, games_feature.migrations.slice(0, 3), { owner: "games" });
    const stored = (id: string) => (database.prepare("SELECT status FROM games_games WHERE id = ?").get(id) as { status: string }).status;
    expect([stored("rawg:portal-2"), stored("steam:400")]).toEqual(["on_hold", "wishlist"]);
    expect(methods.list_games().collections.map((each) => each.name)).toEqual(["Favourites"]);
    expect(methods.get_game("steam:400")!.collection_ids).toEqual([favourites]);
  });
});

describe("keeping a game", () => {
  it("sets status, rating, platforms, stores, edition and playtime", async () => {
    const methods = open_methods();
    await methods.add_game("steam", "620");
    methods.set_game_status("rawg:portal-2", "completed");
    methods.set_game_rating("rawg:portal-2", 8.6);
    methods.set_game_platforms("rawg:portal-2", ["PC", " pc ", "Nintendo Switch"]);
    methods.set_game_stores("rawg:portal-2", ["GOG", " gog ", "Epic Games Store"]);
    methods.set_game_launch_ids("rawg:portal-2", { gog_product_id: " 1207664663 ", lutris_slug: "portal-2" });
    expect(() => methods.set_game_launch_ids("rawg:portal-2", { gog_product_id: "portal_2" })).toThrow("not a GOG product number");
    expect(methods.get_game("rawg:portal-2")).toMatchObject({ gog_product_id: "1207664663", lutris_slug: "portal-2", epic_app_name: "" });
    methods.set_game_edition("rawg:portal-2", " Complete ");
    methods.set_game_playtime("rawg:portal-2", 125.4);
    methods.set_game_last_played("rawg:portal-2", "2026-11-01");
    expect(methods.get_game("rawg:portal-2")).toMatchObject({ status: "completed", rating: 9, owned_platforms: ["PC", "Nintendo Switch"], owned_stores: ["GOG", "Epic Games Store"], edition: "Complete", playtime_minutes: 125, last_played: "2026-11-01" });
    expect(() => methods.set_game_rating("rawg:portal-2", 11)).toThrow("1 to 10");
    expect(() => methods.set_game_last_played("rawg:portal-2", "Nov 1")).toThrow("a day such as");
    expect(() => methods.set_game_status("rawg:portal-2", "beaten" as never)).toThrow("Unknown status");
  });

  it("adds, renames, moves and removes statuses, moving a removed status's games and settings on", async () => {
    const methods = open_methods();
    await methods.add_game("steam", "620");
    const co_op = methods.save_game_status({ label: " Co-op ", group: "playing" });
    expect(co_op).toMatchObject({ label: "Co-op", group: "playing" });
    expect(() => methods.save_game_status({ label: "co-op", group: "playing" })).toThrow("already has a status named");
    expect(() => methods.save_game_status({ label: "Nowhere", group: "later" as never })).toThrow("one of the groups");
    methods.save_game_status({ id: "currently_playing", label: "Playing now" });
    methods.move_game_status(co_op.id, -1);
    methods.move_game_status("wishlist", -1);
    const playing = () => methods.list_games().statuses.filter((each) => each.group === "playing").map((each) => each.label);
    expect(playing()).toEqual(["Playing now", "On hold", "Endless", "Co-op", "Replaying"]);
    expect(methods.list_games().statuses[0]!.id).toBe("wishlist");

    methods.set_game_status("rawg:portal-2", co_op.id);
    expect(methods.get_game("rawg:portal-2")).toMatchObject({ status: co_op.id, status_label: "Co-op", status_group: "playing" });
    methods.set_setting("games.default_status", co_op.id);
    methods.set_steam_category_status("Together", co_op.id);
    methods.remove_game_status(co_op.id);
    expect(methods.get_game("rawg:portal-2")).toMatchObject({ status: "currently_playing", status_label: "Playing now" });
    expect(methods.get_settings()["games.default_status"]).toBe("currently_playing");
    expect(methods.get_settings()["games.steam_category_statuses"]).toEqual({ Together: "currently_playing" });
    expect(() => methods.set_game_status("rawg:portal-2", co_op.id)).toThrow("Unknown status");

    methods.remove_game_status("currently_playing");
    expect(methods.get_game("rawg:portal-2")).toMatchObject({ status: "on_hold" });
    methods.remove_game_status("finished");
    methods.remove_game_status("completed");
    expect(() => methods.remove_game_status("abandoned")).toThrow("needs at least one status");
    expect(() => methods.save_game_status({ id: "abandoned", label: "Abandoned", group: "playing" })).toThrow("needs at least one status");
  });

  it("merges collections renamed to a name in use", async () => {
    const methods = open_methods();
    await methods.add_game("steam", "620");
    const puzzles = methods.save_game_collection({ name: "Puzzles" });
    const co_op = methods.save_game_collection({ name: "Co-op" });
    methods.set_game_collections("rawg:portal-2", [co_op]);
    expect(methods.save_game_collection({ id: co_op, name: "puzzles" })).toBe(puzzles);
    expect(methods.get_game("rawg:portal-2")!.collection_ids).toEqual([puzzles]);
  });

  it("refuses an id another game already has", async () => {
    const methods = open_methods([{ id: "title:portal", title: "Portal", status: "backlog" }]);
    await methods.add_game("steam", "620");
    await expect(methods.set_game_ids("title:portal", { steam_app_id: "https://store.steampowered.com/app/620/" })).rejects.toThrow("Portal 2 already has that Steam app id");
    await expect(methods.set_game_ids("title:portal", { wikidata_id: "nonsense" })).rejects.toThrow("is not a Wikidata item");
  });

  it("keeps a removed game in History", async () => {
    const methods = open_methods();
    await methods.add_game("steam", "620");
    methods.remove_game("rawg:portal-2");
    expect(methods.get_game("rawg:portal-2")).toBeNull();
    const removed = methods.list_recent_changes(10).find((change) => change.kind === "game");
    expect(removed).toMatchObject({ item_id: "rawg:portal-2", item_name: "Portal 2" });
  });
});

// ── itch.io ──────────────────────────────────────────────────────────────────

function itch_key(id: number, url: string, title: string, fields: Record<string, unknown> = {}) {
  return { id: id * 10, game_id: id, game: { id, url, title, cover_url: `https://img.itch.zone/${id}.png`, classification: "game", traits: ["p_windows", "p_linux"], published_at: "2019-01-03T17:28:47Z", ...fields } };
}

describe("itch.io", () => {
  function with_key() {
    const methods = open_methods();
    methods.set_setting("games.itchio_api_key", "itch-key");
    return methods;
  }

  it("asks for a key before importing", async () => {
    await expect(open_methods().import_itchio_library()).rejects.toThrow("Set an itch.io API key");
  });

  it("imports owned games from every page, once each, and only games", async () => {
    const methods = with_key();
    itch_pages = [
      [itch_key(1, "https://devolverdigital.itch.io/pikuniku", "Pikuniku"), itch_key(2, "https://someone.itch.io/a-soundtrack", "A Soundtrack", { classification: "soundtrack" })],
      [itch_key(1, "https://devolverdigital.itch.io/pikuniku", "Pikuniku"), itch_key(3, "https://maker.itch.io/pocket-game", "Pocket Game", { traits: ["p_android"] })],
    ];
    expect(await methods.import_itchio_library()).toEqual({ added: 2, updated: 0 });
    expect(methods.get_game("itchio:devolverdigital/pikuniku")).toMatchObject({
      title: "Pikuniku",
      itchio_id: "devolverdigital/pikuniku",
      status: "backlog",
      owned_platforms: ["PC"],
      owned_stores: ["itch.io"],
      platforms: "Windows, Linux",
      release_date: "2019-01-03",
      cover_url: "https://img.itch.zone/1.png",
    });
    expect(methods.get_game("itchio:maker/pocket-game")).toMatchObject({ owned_platforms: ["Android"] });
    expect(requested("owned-keys")).toHaveLength(3);
    // The key goes only in the header, never in an address.
    expect(requested("itch-key")).toEqual([]);
    const headers = fetch_stub.mock.calls.map((call) => (call as unknown as [string, RequestInit])[1]?.headers as Record<string, string> | undefined);
    expect(headers.some((each) => each?.Authorization === "Bearer itch-key")).toBe(true);
  });

  it("gives a game already here its page and platforms, matched by title", async () => {
    const methods = with_key();
    await methods.add_game("steam", "620");
    methods.set_game_status("rawg:portal-2", "wishlist");
    itch_pages = [[itch_key(9, "https://valve.itch.io/portal-2", "Portal 2")]];
    expect(await methods.import_itchio_library()).toEqual({ added: 0, updated: 1 });
    expect(methods.get_game("rawg:portal-2")).toMatchObject({ itchio_id: "valve/portal-2", status: "backlog", owned_platforms: ["PC"], owned_stores: ["itch.io"] });
    expect(await methods.import_itchio_library()).toEqual({ added: 0, updated: 1 });
  });

  it("imports on its schedule only when one is set and due", async () => {
    const methods = with_key();
    itch_pages = [[itch_key(1, "https://devolverdigital.itch.io/pikuniku", "Pikuniku")]];
    expect(await methods.run_itchio_sync(false)).toBeNull();
    methods.set_setting("games.itchio_sync_hours", 6);
    expect(await methods.run_itchio_sync(false)).toMatchObject({ library: { added: 1, updated: 0 }, failures: [] });
    expect(await methods.run_itchio_sync(false)).toBeNull();
    expect(methods.get_settings()["games.last_itchio_result"]).toBe("library 1 added, 0 updated");
  });

  it("adds a game from its page's link", async () => {
    const methods = open_methods();
    answers["innersloth.itch.io/among-us/data.json"] = {
      title: "Among Us",
      cover_image: "https://img.itch.zone/among.png",
      tags: ["party-game", "space"],
      authors: [{ name: "Innersloth", url: "https://innersloth.itch.io" }],
    };
    expect(await methods.add_game_from_link("https://innersloth.itch.io/among-us")).toEqual({ id: "itchio:innersloth/among-us", title: "Among Us", existed: false });
    expect(methods.get_game("itchio:innersloth/among-us")).toMatchObject({ cover_url: "https://img.itch.zone/among.png", genres: "party-game, space", developers: "Innersloth" });
  });
});

// ── Epic Games Store ─────────────────────────────────────────────────────────

function epic_id(number: number): string {
  return String(number).padStart(32, "0");
}

function epic_record(number: number, fields: Record<string, unknown> = {}) {
  return { namespace: `ns${number}`, catalogItemId: epic_id(number), appName: `App${number}`, sandboxType: "PUBLIC", ...fields };
}

// The catalogue's answer for an item, keyed by its id as Epic gives it.
function epic_catalog(number: number, title: string, fields: Record<string, unknown> = {}) {
  answers[`catalog-public-service-prod06.ol.epicgames.com/catalog/api/shared/namespace/ns${number}/bulk/items`] = {
    [epic_id(number)]: {
      title,
      developer: "Some Studio",
      categories: [{ path: "games" }, { path: "applications" }],
      keyImages: [
        { type: "DieselGameBox", url: `https://epic/${number}-wide.jpg` },
        { type: "DieselGameBoxTall", url: `https://epic/${number}-tall.jpg` },
      ],
      ...fields,
    },
  };
}

describe("the Epic Games Store", () => {
  function with_client() {
    const methods = open_methods();
    methods.set_setting("games.epic_client_id", "launcher-id");
    methods.set_setting("games.epic_client_secret", "launcher-secret");
    return methods;
  }

  async function signed_in() {
    const methods = with_client();
    await methods.sign_in_epic('{"redirectUrl":"https://localhost/","authorizationCode":"abcdef0123456789abcdef","sid":null}');
    return methods;
  }

  it("asks for the client and a sign-in first", async () => {
    await expect(open_methods().sign_in_epic("abcdef0123456789abcdef")).rejects.toThrow("client id and secret");
    await expect(with_client().import_epic_library()).rejects.toThrow("Sign in to the Epic Games Store");
    await expect(with_client().sign_in_epic("not a code")).rejects.toThrow("Paste the authorizationCode");
  });

  it("signs in with the code from Epic's answer and keeps the sign-in", async () => {
    const methods = await signed_in();
    expect(methods.get_settings()).toMatchObject({ "games.epic_account": "Player One", "games.epic_refresh_token": "refresh-1" });
    const [address, init] = fetch_stub.mock.calls[0] as unknown as [string, RequestInit];
    expect(address).not.toContain("abcdef0123456789abcdef");
    expect(String(init.body)).toContain("grant_type=authorization_code");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${btoa("launcher-id:launcher-secret")}`);
    methods.sign_out_epic();
    expect(methods.get_settings()).toMatchObject({ "games.epic_account": "", "games.epic_refresh_token": "" });
  });

  it("imports owned games from every page, leaving out DLC and Unreal assets, and renews the sign-in", async () => {
    const methods = await signed_in();
    epic_pages = [[epic_record(1), epic_record(2), epic_record(3, { namespace: "ue" })], [epic_record(1), epic_record(4, { sandboxType: "PRIVATE" }), epic_record(5)]];
    epic_catalog(1, "Hades");
    epic_catalog(2, "Hades Soundtrack", { mainGameItem: { id: epic_id(1) } });
    epic_catalog(5, "Celeste", { categories: [{ path: "games" }] });
    expect(await methods.import_epic_library()).toEqual({ added: 2, updated: 0 });
    expect(methods.get_game(`epic:${epic_id(1)}`)).toMatchObject({
      title: "Hades",
      epic_id: epic_id(1),
      epic_namespace: "ns1",
      epic_app_name: "App1",
      status: "backlog",
      owned_platforms: ["PC"],
      owned_stores: ["Epic Games Store"],
      cover_url: "https://epic/1-tall.jpg",
      developers: "Some Studio",
    });
    expect(methods.get_game(`epic:${epic_id(5)}`)).toMatchObject({ title: "Celeste" });
    expect(requested("/bulk/items")).toHaveLength(3);
    expect(methods.get_settings()["games.epic_refresh_token"]).not.toBe("refresh-1");

    // Games already tracked by their Epic id are not looked up again.
    fetch_stub.mockClear();
    expect(await methods.import_epic_library()).toEqual({ added: 0, updated: 2 });
    expect(requested("/bulk/items")).toHaveLength(1);
  });

  it("gives a game already here its Epic id, matched by title", async () => {
    const methods = await signed_in();
    await methods.add_game("steam", "620");
    methods.set_game_status("rawg:portal-2", "wishlist");
    epic_pages = [[epic_record(7)]];
    epic_catalog(7, "Portal 2");
    expect(await methods.import_epic_library()).toEqual({ added: 0, updated: 1 });
    expect(methods.get_game("rawg:portal-2")).toMatchObject({ epic_id: epic_id(7), epic_app_name: "App7", status: "backlog", owned_platforms: ["PC"], owned_stores: ["Epic Games Store"] });
  });

  it("says to sign in again once the sign-in has run out", async () => {
    const methods = await signed_in();
    epic_refuses = true;
    await expect(methods.import_epic_library()).rejects.toThrow("sign in again");
  });

  it("imports on its schedule only when one is set and due", async () => {
    const methods = await signed_in();
    epic_pages = [[epic_record(1)]];
    epic_catalog(1, "Hades");
    expect(await methods.run_epic_sync(false)).toBeNull();
    methods.set_setting("games.epic_sync_hours", 6);
    expect(await methods.run_epic_sync(false)).toMatchObject({ library: { added: 1, updated: 0 }, failures: [] });
    expect(await methods.run_epic_sync(false)).toBeNull();
    expect(methods.get_settings()["games.last_epic_result"]).toBe("library 1 added, 0 updated");
  });

  it("takes an Epic id typed by hand", async () => {
    const methods = await signed_in();
    epic_pages = [[epic_record(1)]];
    epic_catalog(1, "Hades");
    await methods.import_epic_library();
    await expect(methods.set_game_ids(`epic:${epic_id(1)}`, { epic_id: "nope" })).rejects.toThrow("Epic Games Store catalogue item id");
  });
});

// ── Steam ────────────────────────────────────────────────────────────────────

describe("Steam", () => {
  function with_account() {
    const methods = open_methods();
    methods.set_setting("games.steam_api_key", "steam-key");
    methods.set_setting("games.steam_id", "https://steamcommunity.com/profiles/76561197960287930/");
    return methods;
  }

  it("finds a profile by its custom URL name", async () => {
    const methods = open_methods();
    methods.set_setting("games.steam_api_key", "steam-key");
    methods.set_setting("games.steam_id", "https://steamcommunity.com/id/OperationLeader/");
    answers["api.steampowered.com/ISteamUser/ResolveVanityURL/v1/"] = { response: { success: 1, steamid: "76561197960287930" } };
    owned = [{ appid: 400, name: "Portal", playtime_forever: 10, rtime_last_played: 0 }];
    expect(await methods.import_steam_library()).toEqual({ added: 1, updated: 0 });
    expect(requested("ResolveVanityURL")[0]).toContain("vanityurl=OperationLeader");
    expect(requested("GetOwnedGames")[0]).toContain("steamid=76561197960287930");
  });

  it("says when no profile has that custom URL name", async () => {
    const methods = open_methods();
    methods.set_setting("games.steam_api_key", "steam-key");
    methods.set_setting("games.steam_id", "NoSuchName");
    answers["api.steampowered.com/ISteamUser/ResolveVanityURL/v1/"] = { response: { success: 42, message: "No match" } };
    await expect(methods.import_steam_library()).rejects.toThrow("no profile with the custom URL NoSuchName");
  });

  it("takes each game's art from where the store says it is", async () => {
    const methods = with_account();
    owned = [{ appid: 400, name: "Portal", playtime_forever: 10, rtime_last_played: 0 }];
    store_down = true;
    await methods.import_steam_library();
    expect(methods.get_game("steam:400")!.cover_url).toBe("https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/400/library_600x900.jpg");

    store_down = false;
    await methods.import_steam_library();
    expect(methods.get_game("steam:400")!.cover_url).toBe("https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/400/portrait.png?t=1");
  });

  it("asks for an account before importing", async () => {
    await expect(open_methods().import_steam_library()).rejects.toThrow("Set a Steam Web API key and your Steam profile");
  });

  it("imports owned games and updates the ones already here", async () => {
    const methods = with_account();
    await methods.add_game("steam", "620");
    owned = [
      { appid: 620, name: "Portal 2", playtime_forever: 305, rtime_last_played: 1_750_000_000 },
      { appid: 400, name: "Portal", playtime_forever: 0, rtime_last_played: 0 },
    ];
    expect(await methods.import_steam_library()).toEqual({ added: 1, updated: 1 });
    expect(methods.get_game("rawg:portal-2")).toMatchObject({ status: "currently_playing", playtime_minutes: 305, owned_platforms: ["PC"], owned_stores: ["Steam"] });
    expect(methods.get_game("steam:400")).toMatchObject({ title: "Portal", status: "backlog", playtime_minutes: 0, owned_platforms: ["PC"], owned_stores: ["Steam"] });
    expect(requested("GetOwnedGames")[0]).toContain("steamid=76561197960287930");
  });

  it("never lowers playtime or undoes a status", async () => {
    const methods = with_account();
    await methods.add_game("steam", "620");
    methods.set_game_status("rawg:portal-2", "completed");
    methods.set_game_playtime("rawg:portal-2", 900);
    owned = [{ appid: 620, name: "Portal 2", playtime_forever: 305, rtime_last_played: 0 }];
    await methods.import_steam_library();
    expect(methods.get_game("rawg:portal-2")).toMatchObject({ status: "completed", playtime_minutes: 900 });
  });

  it("says when the profile's games are private", async () => {
    const methods = with_account();
    answers = base_answers();
    fetch_stub.mockImplementationOnce(async () => new Response(JSON.stringify({ response: {} }), { status: 200 }));
    await expect(methods.import_steam_library()).rejects.toThrow("Game details to Public");
  });

  it("adds wished games as Wishlist and leaves tracked games' statuses", async () => {
    const methods = with_account();
    await methods.add_game("steam", "620");
    owned = [{ appid: 400, name: "Portal", playtime_forever: 0, rtime_last_played: 0 }];
    await methods.import_steam_library();
    wished = [{ appid: 620 }, { appid: 400 }, { appid: 70 }];
    expect(await methods.import_steam_wishlist()).toEqual({ added: 1, updated: 2 });
    expect(methods.get_game("steam:70")).toMatchObject({ title: "Wished 70", status: "wishlist", year: "2027" });
    expect(methods.get_game("rawg:portal-2")).toMatchObject({ status: "backlog" });
    expect(methods.get_game("steam:400")).toMatchObject({ status: "backlog" });
    owned = [{ appid: 70, name: "Wished 70", playtime_forever: 0, rtime_last_played: 0 }];
    await methods.import_steam_library();
    expect(methods.get_game("steam:70")).toMatchObject({ status: "backlog", owned_platforms: ["PC"] });
  });

  it("imports on its schedule only when one is set and due", async () => {
    const methods = with_account();
    owned = [{ appid: 400, name: "Portal", playtime_forever: 10, rtime_last_played: 0 }];
    expect(await methods.run_steam_sync(false)).toBeNull();
    methods.set_setting("games.steam_sync_hours", 6);
    const ran = await methods.run_steam_sync(false);
    expect(ran).toMatchObject({ library: { added: 1, updated: 0 }, wishlist: { added: 0, updated: 0 }, failures: [] });
    expect(await methods.run_steam_sync(false)).toBeNull();
    expect(methods.get_settings()["games.last_steam_result"]).toBe("library 1 added, 0 updated; wishlist 0 added");
  });

  it("gives games in a mapped category its status, the furthest along winning", async () => {
    const methods = with_account();
    owned = [400, 620, 570].map((appid) => ({ appid, name: `Game ${appid}`, playtime_forever: 0, rtime_last_played: 0 }));
    await methods.import_steam_library();
    const category = (name: string, added: number[]) => [`user-collections.${name}`, { key: `user-collections.${name}`, value: JSON.stringify({ id: name, name, added, removed: [] }) }];
    const file = JSON.stringify([category("Finished", [400, 620, 999]), category("On hold", [620, 570]), category("Unmapped", [570])]);
    methods.set_steam_category_status("Finished", "finished");
    methods.set_steam_category_status("on hold", "on_hold");
    methods.set_steam_category_status("Unmapped", "abandoned");
    methods.set_steam_category_status("unmapped", "");
    expect(methods.get_settings()["games.steam_category_statuses"]).toEqual({ Finished: "finished", "on hold": "on_hold" });
    expect(methods.import_steam_categories(file)).toEqual({ categories: 3, updated: 3, untracked: 1 });
    expect([400, 620, 570].map((appid) => methods.get_game(`steam:${appid}`)!.status)).toEqual(["finished", "finished", "on_hold"]);
    expect(methods.get_settings()["games.steam_categories"]).toEqual(["Finished", "On hold", "Unmapped"]);
    expect(methods.import_steam_categories(file)).toMatchObject({ updated: 0 });
    expect(() => methods.import_steam_categories("[]")).toThrow("No categories found");
    expect(() => methods.set_steam_category_status("Finished", "beaten" as never)).toThrow("Unknown status");
  });

  it("keeps the store keys out of what other programs read", () => {
    expect(secret_settings).toEqual(expect.arrayContaining(["games.itchio_api_key", "games.epic_client_secret", "games.epic_refresh_token", "games.steam_api_key"]));
  });
});

// ── IGDB ─────────────────────────────────────────────────────────────────────

describe("the IGDB export import", () => {
  const row = (game: string, status = "") => `<tr><td>0</td><td></td><td>${game}</td><td></td><td>${status}</td></tr>`;
  const header = "<tr><th>Position</th><th>Description</th><th>Game</th><th>Platform</th><th>Status</th></tr>";
  const page = `<h3>Want to Play</h3><table>${header}${row("Half-Life 2")}</table><h3>Played</h3><table>${header}${row("Portal")}${row("Terraria", "Abandoned")}</table>`;

  it("matches games by title and adds the rest by their title", () => {
    const methods = open_methods([
      { id: "steam:400", steam_app_id: "400", title: "Portal", status: "backlog" },
      { id: "steam:105600", steam_app_id: "105600", title: "Terraria", status: "currently_playing" },
    ]);
    expect(methods.import_igdb_export(page)).toEqual({ added: 1, updated: 2 });
    expect(methods.get_game("steam:400")).toMatchObject({ status: "finished" });
    expect(methods.get_game("steam:105600")).toMatchObject({ status: "currently_playing" });
    expect(methods.get_game("title:half life 2")).toMatchObject({ title: "Half-Life 2", status: "backlog", added_at: "2026-11-17" });
    expect(methods.import_igdb_export(page)).toEqual({ added: 0, updated: 3 });
  });

  it("refuses a page with no games", () => {
    expect(() => open_methods().import_igdb_export("<h1>Nope</h1>")).toThrow("No games found");
  });
});

describe("merging games", () => {
  it("gives each catalogue's own answer in a game's shape", async () => {
    const methods = open_methods();
    set_plugin_settings(methods, { rawg: { api_key: "rawg-key" } });
    await methods.add_game("steam", "620");

    const { answers } = await methods.lookup_game_sources("rawg:portal-2");

    expect(answers.map((answer) => answer.source)).toEqual(["rawg", "steam", "wikidata"]);
    expect(answers.every((answer) => answer.values.title === "Portal 2")).toBe(true);
    expect(answers.find((answer) => answer.source === "steam")!.values).toMatchObject({ steam_app_id: "620" });
  });

  it("merges an imported copy into the catalogued one with its collections, picked values and DLC", async () => {
    const methods = open_methods([
      { id: "title:portal", title: "Portal", status: "backlog" },
      { id: "title:peer review", title: "Peer Review", status: "backlog" },
    ]);
    await methods.add_game("steam", "620");
    methods.set_game_rating("title:portal", 8);
    methods.set_game_collections("title:portal", [methods.save_game_collection({ name: "Puzzles" })]);
    methods.set_game_base(methods.list_games().games.find((game) => game.title === "Peer Review")!.id, "title:portal");

    const merged = methods.merge_games(["rawg:portal-2", "title:portal"], "rawg:portal-2", { rating: 8, owned_platforms: ["PC", "Switch", "pc"], owned_stores: ["GOG", "gog"] });

    expect(methods.list_games().games.map((game) => game.id)).not.toContain("title:portal");
    expect(merged).toMatchObject({ id: "rawg:portal-2", rating: 8, owned_platforms: ["PC", "Switch"], owned_stores: ["GOG"], steam_app_id: "620" });
    expect(merged.collection_ids).toHaveLength(1);
    expect(methods.list_games().games.find((game) => game.title === "Peer Review")!.base_game).toBe("rawg:portal-2");
  });

  it("refuses an id a game outside the merge has", async () => {
    const methods = open_methods([{ id: "title:portal", title: "Portal", status: "backlog" }]);
    await methods.add_game("steam", "620");
    expect(() => methods.merge_games(["title:portal"], "title:portal", { steam_app_id: "620" })).toThrow("Portal 2 already has that Steam app id");
  });
});

describe("cover", () => {
  it("sets a game's cover address and clears the kept image with it", async () => {
    const methods = open_methods();
    await methods.add_game("steam", "620");

    methods.set_game_cover("rawg:portal-2", " https://example.org/portal.jpg ");
    expect(methods.get_game("rawg:portal-2")).toMatchObject({ cover_url: "https://example.org/portal.jpg" });

    methods.set_game_cover("rawg:portal-2", "");
    expect(methods.get_game("rawg:portal-2")).toMatchObject({ cover_url: "", cover_file: "", cover_file_from: "" });
  });

  it("keeps a cover set by hand through a refresh, until it is cleared", async () => {
    const methods = open_methods();
    await methods.add_game("steam", "620");
    methods.set_game_cover("rawg:portal-2", "https://example.org/portal.jpg");

    await methods.set_game_ids("rawg:portal-2", { steam_app_id: "620" });
    expect(methods.get_game("rawg:portal-2")).toMatchObject({ cover_url: "https://example.org/portal.jpg", cover_by_hand: true });

    methods.set_game_cover("rawg:portal-2", "");
    await methods.set_game_ids("rawg:portal-2", { steam_app_id: "620" });
    expect(methods.get_game("rawg:portal-2")).toMatchObject({ cover_url: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/620/abc/library_capsule_2x.jpg?t=1", cover_by_hand: false });
  });

  it("refuses an address that is not a web address", async () => {
    const methods = open_methods();
    await methods.add_game("steam", "620");

    expect(() => methods.set_game_cover("rawg:portal-2", "file:///etc/passwd")).toThrow("web address");
  });
});

describe("cover fallback", () => {
  it("takes the next catalogue's art when the best one does not load", async () => {
    const methods = open_methods();
    set_plugin_settings(methods, { rawg: { api_key: "rawg-key" } });
    answers["rawg/shot.jpg"] = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
    await methods.add_game("steam", "620");
    expect(methods.get_game("rawg:portal-2")!.cover_url).toBe("https://rawg/shot.jpg");
  });

  it("asks again on a refresh and keeps the best art once it loads", async () => {
    const methods = open_methods();
    set_plugin_settings(methods, { rawg: { api_key: "rawg-key" } });
    answers["rawg/shot.jpg"] = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
    await methods.add_game("steam", "620");
    answers["shared.akamai.steamstatic.com/store_item_assets/steam/apps/620/abc/library_capsule_2x.jpg"] = new Blob([new Uint8Array([4])], { type: "image/jpeg" });
    await methods.set_game_ids("rawg:portal-2", { steam_app_id: "620" });
    expect(methods.get_game("rawg:portal-2")!.cover_url).toBe("https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/620/abc/library_capsule_2x.jpg?t=1");
  });
});

describe("notes", () => {
  it("keeps a game's notes apart from its review", async () => {
    const methods = open_methods();
    await methods.add_game("steam", "620");

    methods.set_game_notes("rawg:portal-2", "Play *co-op* next");

    expect(methods.get_game("rawg:portal-2")).toMatchObject({ notes: "Play *co-op* next", review: "" });
  });
});

// ── Catalogue plugins ────────────────────────────────────────────────────────

describe("catalogue plugins", () => {
  it("move each catalogue's key from the games settings into its plugin once, keeping a key already set there", () => {
    const database = new DatabaseSync(":memory:");
    open_store(database);
    const methods = bind_methods(() => database, () => undefined);
    methods.set_setting("games.rawg_api_key", " rawg-key ");
    methods.set_setting("games.igdb_client_id", "twitch-app");
    methods.set_setting("games.thegamesdb_api_key", "old-key");
    set_plugin_settings(methods, { thegamesdb: { api_key: "new-key" } });

    open_store(database);

    const settings = methods.get_settings();
    expect(settings["games.rawg_api_key"]).toBeUndefined();
    expect(settings["games.igdb_client_id"]).toBeUndefined();
    expect(settings["games.thegamesdb_api_key"]).toBeUndefined();
    expect(settings.plugins).toMatchObject({
      "x-media-tracker.rawg": { settings: { api_key: "rawg-key" } },
      "x-media-tracker.igdb": { settings: { client_id: "twitch-app" } },
      "x-media-tracker.thegamesdb": { settings: { api_key: "new-key" } },
    });
  });

  it("hide a catalogue's key from other programs and keep it when its settings are written back hidden", () => {
    const methods = open_methods();
    set_plugin_settings(methods, { rawg: { api_key: "rawg-key" }, igdb: { client_id: "twitch-app", client_secret: "twitch-secret" } });

    const hidden = without_secret_settings(methods.get_settings()).plugins as Record<string, { settings: Record<string, string> }>;
    expect(hidden["x-media-tracker.rawg"]!.settings.api_key).toBe(hidden_secret);
    expect(hidden["x-media-tracker.igdb"]!.settings).toEqual({ client_id: "twitch-app", client_secret: hidden_secret });

    methods.set_setting("plugins", { ...hidden, "x-media-tracker.rawg": { enabled: true, settings: { api_key: hidden_secret } } });
    expect(methods.get_settings().plugins).toMatchObject({ "x-media-tracker.rawg": { enabled: true, settings: { api_key: "rawg-key" } }, "x-media-tracker.igdb": { settings: { client_secret: "twitch-secret" } } });
  });

  it("leave a catalogue that is turned off out of search", async () => {
    const methods = open_methods();
    set_plugin_settings(methods, { thegamesdb: { api_key: "tgdb-key" } });
    methods.set_setting("plugins", { ...(methods.get_settings().plugins as object), "x-media-tracker.thegamesdb": { enabled: false, settings: { api_key: "tgdb-key" } }, "x-media-tracker.rawg": { enabled: false } });

    const search = await methods.search_games("portal");

    expect(search.failures).toEqual(["IGDB: no key set", "MobyGames: no key set", "Giant Bomb: no key set"]);
    expect(requested("thegamesdb")).toEqual([]);
  });
});
