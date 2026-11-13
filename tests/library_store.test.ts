import { DatabaseSync } from "node:sqlite";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { refresh_concurrency, type LibraryRefresh } from "../src/shared/library/store.ts";
import { bind_methods, open_store } from "../src/shared/store.ts";
import { trilium_database, trilium_groups } from "./trilium_sample.ts";

// ── TMDB stand-in ────────────────────────────────────────────────────────────

const tmdb_answers: Record<string, unknown> = {
  "/3/movie/693134": { id: 693134, title: "Dune: Part Two", release_date: "2024-02-27", poster_path: "/new.jpg", runtime: 166, imdb_id: "tt15239678", genres: [{ name: "Science Fiction" }] },
  "/3/tv/1399": {
    id: 1399,
    name: "Game of Thrones",
    first_air_date: "2011-04-17",
    episode_run_time: [60],
    external_ids: { imdb_id: "tt0944947" },
    genres: [{ name: "Drama" }],
    seasons: [
      { season_number: 0, episode_count: 5 },
      { season_number: 1, episode_count: 10 },
      { season_number: 2, episode_count: 10 },
    ],
  },
  "/3/tv/1396": { id: 1396, name: "Breaking Bad", first_air_date: "2008-01-20", external_ids: { imdb_id: "tt0903747" }, seasons: [{ season_number: 1, episode_count: 7 }] },
  "/3/find/tt0944947": { movie_results: [], tv_results: [{ id: 1399 }] },
  "/3/find/tt0903747": { movie_results: [], tv_results: [{ id: 1396 }] },
  "/3/search/multi": {
    results: [
      { id: 693134, media_type: "movie", title: "Dune: Part Two" },
      { id: 1, media_type: "person", name: "Someone" },
      { id: 1399, media_type: "tv", name: "Game of Thrones" },
    ],
  },
};

const fetch_stub = vi.fn(async (address: string) => {
  const url = new URL(address);
  const answer = tmdb_answers[url.pathname];
  if (answer) return new Response(JSON.stringify(answer), { status: 200 });
  return new Response(JSON.stringify({ status_message: "The resource you requested could not be found." }), { status: 404 });
});

beforeEach(() => {
  fetch_stub.mockClear();
  vi.stubGlobal("fetch", fetch_stub);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 12, 12, 0));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function open_methods(on_change: () => void = () => undefined) {
  const database = new DatabaseSync(":memory:");
  open_store(database);
  const store = bind_methods(() => database, on_change);
  store.set_setting("library.tmdb_api_key", "test-key");
  return store;
}

// Starts a refresh and waits for it to end, as the page does.
async function refreshed(store: ReturnType<typeof open_methods>): Promise<LibraryRefresh> {
  store.refresh_library();
  let refresh = store.get_library_refresh();
  while (refresh.state === "running") {
    await new Promise((resolve) => setTimeout(resolve, 1));
    refresh = store.get_library_refresh();
  }
  return refresh;
}

// ── Adding ───────────────────────────────────────────────────────────────────

describe("adding titles", () => {
  it("adds a show from TMDB with its episode count, leaving out the specials, at the default status", async () => {
    const store = open_methods();
    store.set_setting("library.default_status", "watching");

    const added = await store.add_title("show", "1399");

    expect(added).toEqual({ id: "tmdb:1399", name: "Game of Thrones", existed: false });
    expect(store.get_title("tmdb:1399")).toMatchObject({ imdb_id: "tt0944947", total_episodes: 20, runtime: 60, status: "watching", added_at: "2026-11-12" });
  });

  it("finds a title already tracked by its IMDb id and refreshes it, keeping the user's own fields", async () => {
    const store = open_methods();
    store.import_trilium_media(trilium_database, "");
    store.set_episodes_watched("imdb:tt0903747", [{ season: 1, from: 1, to: 2 }], true, 0);

    const added = await store.add_title_from_link("https://www.imdb.com/title/tt0903747/");

    expect(added).toEqual({ id: "imdb:tt0903747", name: "Breaking Bad", existed: true });
    expect(store.get_title("imdb:tt0903747")).toMatchObject({ tmdb_id: "1396", total_episodes: 7, watched_count: 2, status: "watching" });
    expect(store.list_library().titles).toHaveLength(3);
  });

  it("marks search results already tracked, leaving out people", async () => {
    const store = open_methods();
    store.import_trilium_media(trilium_database, "");

    const results = await store.search_tmdb("dune", "all");

    expect(results.map((result) => [result.name, result.media_type, result.tracked_id])).toEqual([
      ["Dune: Part Two", "movie", "tmdb:693134"],
      ["Game of Thrones", "show", ""],
    ]);
  });

  it("asks for a key first and never repeats it in TMDB's refusals", async () => {
    const store = open_methods();
    store.set_setting("library.tmdb_api_key", "");
    await expect(store.add_title("movie", "693134")).rejects.toThrow("Set a TMDB API key in Settings first.");

    store.set_setting("library.tmdb_api_key", "secret-key");
    const failure = await store.add_title("movie", "404").catch((error: Error) => error.message);
    expect(failure).toBe("TMDB: The resource you requested could not be found. (HTTP 404)");
    expect(failure).not.toContain("secret-key");
  });

  it("refuses a link that is neither TMDB nor IMDb", async () => {
    const store = open_methods();
    await expect(store.add_title_from_link("https://example.org/dune")).rejects.toThrow(/Not a TMDB or IMDb link/);
  });
});

// ── Watching ─────────────────────────────────────────────────────────────────

describe("watching", () => {
  it("marks runs of episodes in one change and sets the show's status from its progress", () => {
    const store = open_methods();
    store.import_trilium_media(trilium_database, "");

    let severance = store.set_episodes_watched("tmdb:95396", [{ season: 2, from: 2, to: 10 }], true, 19);
    expect(severance).toMatchObject({ watched_episodes: "s01e01-e09,s02e01-e10", watched_count: 19, status: "watched", last_watched: "2026-11-12" });

    severance = store.set_episodes_watched("tmdb:95396", [{ season: 1, from: 1, to: 9 }, { season: 2, from: 1, to: 10 }], false, 0);
    expect(severance).toMatchObject({ watched_episodes: "", status: "planned", total_episodes: 19 });
  });

  it("sets status and rating, watched marking today, and refuses what is not one", () => {
    const store = open_methods();
    store.import_trilium_media(trilium_database, "");

    store.set_title_status("imdb:tt0903747", "watched");
    store.set_title_rating("imdb:tt0903747", 8);
    expect(store.get_title("imdb:tt0903747")).toMatchObject({ status: "watched", last_watched: "2026-11-12", rating: 8 });
    store.set_title_rating("imdb:tt0903747", 0);
    expect(store.get_title("imdb:tt0903747")!.rating).toBeNull();

    expect(() => store.set_title_status("imdb:tt0903747", "lost" as never)).toThrow("Unknown status: lost.");
    expect(() => store.set_title_rating("imdb:tt0903747", 11)).toThrow();
    expect(() => store.set_title_status("tmdb:1", "watched")).toThrow("That title is not in the library.");
  });

  it("refreshes every title from TMDB and settles each show's status, never touching a rating", async () => {
    const store = open_methods();
    store.import_trilium_media(trilium_database, "");
    store.set_episodes_watched("imdb:tt0903747", [{ season: 1, from: 1, to: 7 }], true, 0);

    const refresh = await refreshed(store);

    expect(refresh).toMatchObject({ state: "done", done: 3, total: 3, report: { total: 3, metadata_updated: 2, status_updated: 1, failed: 1 } });
    expect(store.get_title("tmdb:693134")).toMatchObject({ poster_path: "/new.jpg", runtime: 166, rating: 9 });
    expect(store.get_title("imdb:tt0903747")).toMatchObject({ tmdb_id: "1396", total_episodes: 7, status: "watched" });
  });

  it("refreshes several titles at once, never more than its limit", async () => {
    const store = open_methods();
    const ids = Array.from({ length: refresh_concurrency * 3 }, (_, index) => String(index + 1));
    store.import_trilium_media(JSON.stringify({ titles: Object.fromEntries(ids.map((id) => [`tmdb:${id}`, { tmdbId: id, mediaType: "movie", title: `Movie ${id}`, status: "planned" }])) }), "");
    let in_flight = 0;
    let most_in_flight = 0;
    vi.stubGlobal("fetch", async (address: string) => {
      most_in_flight = Math.max(most_in_flight, ++in_flight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      in_flight--;
      return new Response(JSON.stringify({ id: Number(new URL(address).pathname.split("/").pop()), title: "Movie" }), { status: 200 });
    });

    const { report } = await refreshed(store);

    expect(report!.total).toBe(refresh_concurrency * 3);
    expect(report!.failed).toBe(0);
    expect(most_in_flight).toBe(refresh_concurrency);
  });

  it("answers a refresh at once, joins the one running, and tells other pages once it ends", async () => {
    const on_change = vi.fn();
    const store = open_methods(on_change);
    store.import_trilium_media(trilium_database, "");
    let answer_tmdb = (): void => undefined;
    const answered = new Promise<void>((resolve) => (answer_tmdb = resolve));
    vi.stubGlobal("fetch", async (address: string) => {
      await answered;
      return fetch_stub(address);
    });
    expect(store.get_library_refresh().state).toBe("none");
    on_change.mockClear();

    const started = store.refresh_library();
    const joined = store.refresh_library();

    expect(started).toMatchObject({ state: "running", done: 0, total: 3, report: null });
    expect(joined.started_at).toBe(started.started_at);
    const changes_while_running = on_change.mock.calls.length;
    answer_tmdb();
    const refresh = await refreshed(store);
    await Promise.resolve();
    expect(refresh).toMatchObject({ state: "done", done: 3 });
    expect(on_change.mock.calls.length).toBeGreaterThan(changes_while_running);
  });
});

// ── Collections ──────────────────────────────────────────────────────────────

describe("collections", () => {
  it("merges a collection renamed onto a name in use, whatever its case", () => {
    const store = open_methods();
    store.import_trilium_media(trilium_database, "");
    const { collections } = store.list_library();
    const apple = collections.find((collection) => collection.name === "Apple")!;

    const kept = store.save_collection({ id: apple.id, name: "comfort", group_id: null });

    const after = store.list_library();
    expect(after.collections.map((collection) => collection.name)).toEqual(["Comfort", "Crime", "Dune"]);
    expect(store.get_title("tmdb:95396")!.collection_ids).toEqual([kept]);
    expect(store.save_collection({ name: "DUNE", group_id: null })).toBe(collections.find((collection) => collection.name === "Dune")!.id);
  });

  it("keeps a group's collections when it is removed, and its titles when a collection is", () => {
    const store = open_methods();
    store.import_trilium_media(trilium_database, trilium_groups);
    const { groups, collections } = store.list_library();
    const mood = groups.find((group) => group.name === "Mood")!;

    store.remove_collection_group(mood.id);
    expect(store.list_library().collections.find((collection) => collection.name === "Comfort")!.group_id).toBeNull();

    store.remove_collection(collections.find((collection) => collection.name === "Dune")!.id);
    expect(store.get_title("tmdb:693134")!.collection_ids).toEqual([]);
  });

  it("moves a group earlier or later, and not past either end", () => {
    const store = open_methods();
    store.import_trilium_media(trilium_database, trilium_groups);
    const [mood, franchise] = store.list_library().groups;

    store.move_collection_group(franchise!.id, -1);
    store.move_collection_group(franchise!.id, -1);
    expect(store.list_library().groups.map((group) => group.name)).toEqual(["Franchise", "Mood"]);
    expect(mood!.name).toBe("Mood");
  });
});

// ── Trilium ──────────────────────────────────────────────────────────────────

describe("the Trilium library", () => {
  it("imports titles, episodes and collections in their groups, the poster kept as its path", () => {
    const store = open_methods();

    expect(store.import_trilium_media(trilium_database, trilium_groups)).toEqual({ added: 3, updated: 0 });

    const library = store.list_library();
    const group_of = (name: string) => library.groups.find((group) => group.id === library.collections.find((collection) => collection.name === name)!.group_id)?.name ?? null;
    expect(library.groups.map((group) => group.name)).toEqual(["Mood", "Franchise"]);
    expect([group_of("Comfort"), group_of("Dune"), group_of("Crime")]).toEqual(["Mood", "Franchise", null]);
    expect(store.get_title("tmdb:693134")).toMatchObject({ poster_path: "/dune.jpg", rating: 9, status: "watched", last_watched: "2026-07-20" });
    expect(store.get_title("tmdb:95396")).toMatchObject({ watched_episodes: "s01e01-e09,s02e01", watched_count: 10, total_episodes: 19 });
  });

  it("merges a second import, keeping status and rating set here and adding its episodes", () => {
    const store = open_methods();
    store.import_trilium_media(trilium_database, "");
    store.set_episodes_watched("tmdb:95396", [{ season: 1, from: 1, to: 9 }], false, 0);
    store.set_title_status("tmdb:95396", "dropped");
    store.set_title_rating("tmdb:95396", 6);

    expect(store.import_trilium_media(trilium_database, "")).toEqual({ added: 0, updated: 3 });
    expect(store.get_title("tmdb:95396")).toMatchObject({ status: "dropped", rating: 6, watched_episodes: "s01e01-e09,s02e01" });
    expect(store.list_library().titles).toHaveLength(3);
  });

  it("exports what it imports", () => {
    const store = open_methods();
    store.import_trilium_media(trilium_database, "");
    const copy = open_methods();

    copy.import_trilium_media(store.export_library(), "");

    expect(copy.list_library().titles).toEqual(store.list_library().titles.map((title) => ({ ...title, collection_ids: expect.any(Array) })));
    expect(copy.get_title("tmdb:95396")!.collection_ids).toHaveLength(2);
  });

  it("refuses a file that is not the Database note", () => {
    const store = open_methods();
    expect(() => store.import_trilium_media("not json", "")).toThrow(/not JSON/);
    expect(() => store.import_trilium_media("{}", "")).toThrow(/has no "titles"/);
  });
});
