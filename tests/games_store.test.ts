import { DatabaseSync } from "node:sqlite";

import { migrate } from "@x-tech-laboratories/x-libs/sql";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { games_feature } from "../src/shared/games/store.ts";
import { bind_methods, open_store, secret_settings } from "../src/shared/store.ts";

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
  if (url.pathname === "/IStoreBrowseService/GetItems/v1/") {
    if (store_down) return undefined;
    const ids = (JSON.parse(url.searchParams.get("input_json")!) as { ids: { appid: number }[] }).ids;
    return { response: { store_items: ids.map(({ appid }) => ({ appid, name: `Wished ${appid}`, release: { steam_release_date: 1_800_000_000 }, assets: assets_of(appid) })) } };
  }
  return answers[`${url.host}${url.pathname}`];
}

const fetch_stub = vi.fn(async (address: string) => {
  const answer = answer_of(new URL(address));
  if (answer) return new Response(JSON.stringify(answer), { status: 200 });
  return new Response("{}", { status: 404 });
});

beforeEach(() => {
  answers = base_answers();
  owned = [];
  wished = [];
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

function open_methods() {
  const database = new DatabaseSync(":memory:");
  open_store(database);
  return bind_methods(() => database, () => undefined);
}

function requested(part: string): string[] {
  return fetch_stub.mock.calls.map(([address]) => String(address)).filter((address) => address.includes(part));
}

// ── Adding ───────────────────────────────────────────────────────────────────

describe("adding a game", () => {
  it("links the catalogues through Wikidata and takes each one's best", async () => {
    const methods = open_methods();
    methods.set_setting("games.rawg_api_key", "rawg-key");
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
    expect(search.failures).toEqual(["RAWG: no key set", "MobyGames: no key set", "Giant Bomb: no key set"]);
    expect(search.results.map((result) => [result.title, result.wikidata_id, result.steam_app_id, result.tracked_id])).toEqual([["Portal 2", "Q279446", "620", "rawg:portal-2"]]);
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
  it("sets status, rating, platforms, edition and playtime", async () => {
    const methods = open_methods();
    await methods.add_game("steam", "620");
    methods.set_game_status("rawg:portal-2", "completed");
    methods.set_game_rating("rawg:portal-2", 8.6);
    methods.set_game_platforms("rawg:portal-2", ["PC", " pc ", "Nintendo Switch"]);
    methods.set_game_edition("rawg:portal-2", " Complete ");
    methods.set_game_playtime("rawg:portal-2", 125.4);
    methods.set_game_last_played("rawg:portal-2", "2026-11-01");
    expect(methods.get_game("rawg:portal-2")).toMatchObject({ status: "completed", rating: 9, owned_platforms: ["PC", "Nintendo Switch"], edition: "Complete", playtime_minutes: 125, last_played: "2026-11-01" });
    expect(() => methods.set_game_rating("rawg:portal-2", 11)).toThrow("1 to 10");
    expect(() => methods.set_game_last_played("rawg:portal-2", "Nov 1")).toThrow("a day such as");
    expect(() => methods.set_game_status("rawg:portal-2", "beaten" as never)).toThrow("Unknown status");
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
    const methods = open_methods();
    await methods.add_game("steam", "620");
    methods.import_trilium_games(JSON.stringify({ games: { a: { title: "Portal" } } }), "");
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
    expect(methods.get_game("rawg:portal-2")).toMatchObject({ status: "currently_playing", playtime_minutes: 305, owned_platforms: ["PC"] });
    expect(methods.get_game("steam:400")).toMatchObject({ title: "Portal", status: "backlog", playtime_minutes: 0, owned_platforms: ["PC"] });
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

  it("puts wished games on the Wishlist until they are owned", async () => {
    const methods = with_account();
    await methods.add_game("steam", "620");
    owned = [{ appid: 400, name: "Portal", playtime_forever: 0, rtime_last_played: 0 }];
    await methods.import_steam_library();
    wished = [{ appid: 620 }, { appid: 400 }, { appid: 70 }];
    expect(await methods.import_steam_wishlist()).toEqual({ added: 1, updated: 2 });
    expect(methods.get_game("steam:70")).toMatchObject({ title: "Wished 70", status: "wishlist", year: "2027" });
    expect(methods.get_game("rawg:portal-2")).toMatchObject({ status: "wishlist" });
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

  it("keeps every catalogue's key and the Steam key out of what other programs read", () => {
    expect(secret_settings).toEqual(expect.arrayContaining(["games.rawg_api_key", "games.mobygames_api_key", "games.giantbomb_api_key", "games.steam_api_key"]));
  });
});

// ── Trilium ──────────────────────────────────────────────────────────────────

describe("the Trilium Game Tracker import", () => {
  const config = JSON.stringify({ statuses: { entries: { "item-2": { name: "Endless", role: "playing" } } } });

  it("adds new games and merges ones already here", async () => {
    const methods = open_methods();
    await methods.add_game("steam", "620");
    methods.set_game_rating("rawg:portal-2", 7);
    const database = JSON.stringify({
      games: {
        "steam:620": { steamAppId: "620", title: "Portal 2", status: "beaten", rating: 10, playtime: 305, lastPlayed: "2025-06-04", collections: ["Puzzles"] },
        "steam:105600": { steamAppId: "105600", title: "Terraria", status: "item-2", playtime: 50 },
      },
    });
    expect(methods.import_trilium_games(database, config)).toEqual({ added: 1, updated: 1 });
    const library = methods.list_games();
    const names = new Map(library.collections.map((collection) => [collection.id, collection.name]));
    expect(methods.get_game("rawg:portal-2")).toMatchObject({ status: "finished", rating: 7, playtime_minutes: 305, last_played: "2025-06-04" });
    expect(methods.get_game("rawg:portal-2")!.collection_ids.map((id) => names.get(id))).toEqual(["Puzzles"]);
    expect(methods.get_game("steam:105600")).toMatchObject({ title: "Terraria", status: "endless", owned_platforms: ["PC"] });
    expect(methods.get_game("steam:105600")!.collection_ids).toEqual([]);
  });

  it("refuses a file with no games", () => {
    expect(() => open_methods().import_trilium_games("{}", "")).toThrow("No games found");
  });
});

// ── IGDB ─────────────────────────────────────────────────────────────────────

describe("the IGDB export import", () => {
  const row = (game: string, status = "") => `<tr><td>0</td><td></td><td>${game}</td><td></td><td>${status}</td></tr>`;
  const header = "<tr><th>Position</th><th>Description</th><th>Game</th><th>Platform</th><th>Status</th></tr>";
  const page = `<h3>Want to Play</h3><table>${header}${row("Half-Life 2")}</table><h3>Played</h3><table>${header}${row("Portal")}${row("Terraria", "Abandoned")}</table>`;

  it("matches games by title and adds the rest by their title", () => {
    const methods = open_methods();
    methods.import_trilium_games(JSON.stringify({ games: { "steam:400": { steamAppId: "400", title: "Portal", status: "backlog" }, "steam:105600": { steamAppId: "105600", title: "Terraria", status: "playing" } } }), "");
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
    methods.set_setting("games.rawg_api_key", "rawg-key");
    await methods.add_game("steam", "620");

    const { answers } = await methods.lookup_game_sources("rawg:portal-2");

    expect(answers.map((answer) => answer.source)).toEqual(["rawg", "steam", "wikidata"]);
    expect(answers.every((answer) => answer.values.title === "Portal 2")).toBe(true);
    expect(answers.find((answer) => answer.source === "steam")!.values).toMatchObject({ steam_app_id: "620" });
  });

  it("merges an imported copy into the catalogued one with its collections, picked values and DLC", async () => {
    const methods = open_methods();
    await methods.add_game("steam", "620");
    methods.import_trilium_games(JSON.stringify({ games: { a: { title: "Portal" }, b: { title: "Peer Review" } } }), "");
    methods.set_game_rating("title:portal", 8);
    methods.set_game_collections("title:portal", [methods.save_game_collection({ name: "Puzzles" })]);
    methods.set_game_base(methods.list_games().games.find((game) => game.title === "Peer Review")!.id, "title:portal");

    const merged = methods.merge_games(["rawg:portal-2", "title:portal"], "rawg:portal-2", { rating: 8, owned_platforms: ["PC", "Switch", "pc"] });

    expect(methods.list_games().games.map((game) => game.id)).not.toContain("title:portal");
    expect(merged).toMatchObject({ id: "rawg:portal-2", rating: 8, owned_platforms: ["PC", "Switch"], steam_app_id: "620" });
    expect(merged.collection_ids).toHaveLength(1);
    expect(methods.list_games().games.find((game) => game.title === "Peer Review")!.base_game).toBe("rawg:portal-2");
  });

  it("refuses an id a game outside the merge has", async () => {
    const methods = open_methods();
    await methods.add_game("steam", "620");
    methods.import_trilium_games(JSON.stringify({ games: { a: { title: "Portal" } } }), "");
    expect(() => methods.merge_games(["title:portal"], "title:portal", { steam_app_id: "620" })).toThrow("Portal 2 already has that Steam app id");
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
