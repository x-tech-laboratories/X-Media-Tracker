import { DatabaseSync } from "node:sqlite";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apply_import, import_item } from "../src/shared/library/importing.ts";
import { items_from_stremio } from "../src/shared/sources/stremio/mapping.ts";
import { history_rows, items_from_ratings, items_from_watched } from "../src/shared/sources/trakt/mapping.ts";
import { bind_methods, open_store } from "../src/shared/store.ts";
import { trilium_database } from "./trilium_sample.ts";

// ── Services stand-in ────────────────────────────────────────────────────────

interface Answer {
  status?: number;
  body: unknown;
  pages?: number;
}

let answers: Record<string, Answer | ((body: unknown, url: URL) => Answer)> = {};
const requests: { url: URL; body: unknown; headers: Record<string, string> }[] = [];

const fetch_stub = vi.fn(async (address: string, init?: RequestInit) => {
  const url = new URL(address);
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  requests.push({ url, body, headers: (init?.headers ?? {}) as Record<string, string> });
  const found = answers[`${init?.method ?? "GET"} ${url.host}${url.pathname}`];
  if (!found) return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
  const answer = typeof found === "function" ? found(body, url) : found;
  return new Response(JSON.stringify(answer.body), { status: answer.status ?? 200, headers: { "x-pagination-page-count": String(answer.pages ?? 1) } });
});

beforeEach(() => {
  answers = {};
  requests.length = 0;
  vi.stubGlobal("fetch", fetch_stub);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function open_methods() {
  const database = new DatabaseSync(":memory:");
  open_store(database);
  const store = bind_methods(() => database, () => undefined);
  // Without a TMDB key nothing is looked up, so only the services' answers matter.
  store.set_setting("library.import_fetch_metadata", false);
  return { database, store };
}

function signed_in_to_trakt() {
  const opened = open_methods();
  opened.store.set_trakt_app(" client-id \n", "client-secret");
  opened.store.set_setting("trakt.access_token", "access");
  opened.store.set_setting("trakt.refresh_token", "refresh");
  opened.store.set_setting("trakt.expires_at", Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60);
  return opened;
}

const watched_show = {
  last_watched_at: "2026-10-01T20:00:00.000Z",
  show: { title: "Severance", year: 2022, ids: { trakt: 1, tmdb: 95396, imdb: "tt11280740" } },
  seasons: [
    { number: 0, episodes: [{ number: 1, last_watched_at: "2026-01-01T00:00:00.000Z" }] },
    { number: 2, episodes: [{ number: 2, last_watched_at: "2026-10-01T20:00:00.000Z" }] },
  ],
};

const watched_movie = { last_watched_at: "2026-09-01T20:00:00.000Z", movie: { title: "Arrival", year: 2016, ids: { trakt: 2, tmdb: 329865, imdb: "tt2543164" } } };

// ── Importing ────────────────────────────────────────────────────────────────

describe("the import engine", () => {
  it("matches on any id, merges episodes, and fills a rating only where there is none unless told to overwrite", async () => {
    const { database, store } = open_methods();
    store.import_trilium_media(trilium_database, "");
    store.set_title_rating("tmdb:95396", 7);

    const report = await apply_import(database, [
      import_item({ media_type: "show", imdb_id: "tt0903747", trakt_id: "9", rating: 9, episodes: [{ season: 1, episode: 1, watched_at: "2026-05-01T10:00:00Z" }] }),
      import_item({ media_type: "show", tmdb_id: "95396", rating: 10, episodes: [{ season: 2, episode: 2, watched_at: "" }] }),
      import_item({ media_type: "movie", name: "Arrival", tmdb_id: "329865", status: "watched", last_watched: "2026-09-01T20:00:00Z" }),
    ]);

    expect(report).toEqual({ added: 1, updated: 2 });
    expect(store.get_title("imdb:tt0903747")).toMatchObject({ trakt_id: "9", rating: 9, watched_episodes: "s01e01", status: "watching" });
    expect(store.get_title("tmdb:95396")).toMatchObject({ rating: 7, watched_episodes: "s01e01-e09,s02e01-e02" });
    expect(store.get_title("tmdb:329865")).toMatchObject({ name: "Arrival", status: "watched", last_watched: "2026-09-01" });

    store.set_setting("library.import_overwrite_ratings", true);
    await apply_import(database, [import_item({ media_type: "show", tmdb_id: "95396", rating: 10 })]);
    expect(store.get_title("tmdb:95396")!.rating).toBe(10);
  });

  it("leaves status alone when Settings says imports do not set it, unless asked for one watch", async () => {
    const { database, store } = open_methods();
    store.set_setting("library.import_marks_watched", false);
    await apply_import(database, [import_item({ media_type: "movie", tmdb_id: "1", name: "One", status: "watched" })]);
    expect(store.get_title("tmdb:1")!.status).toBe("planned");
    await apply_import(database, [import_item({ media_type: "movie", tmdb_id: "1", status: "watched" })], { marks_watched: true });
    expect(store.get_title("tmdb:1")!.status).toBe("watched");
  });
});

// ── Trakt ────────────────────────────────────────────────────────────────────

describe("Trakt's lists", () => {
  it("reads watched movies and shows, leaving out the specials", () => {
    const [movie, show] = items_from_watched([watched_movie], [watched_show]);
    expect(movie).toMatchObject({ media_type: "movie", name: "Arrival", tmdb_id: "329865", imdb_id: "tt2543164", trakt_id: "2", status: "watched" });
    expect(show!.episodes).toEqual([{ season: 2, episode: 2, watched_at: "2026-10-01T20:00:00.000Z" }]);
  });

  it("reads ratings, and the history newest first with each episode named", () => {
    expect(items_from_ratings([{ rating: 8, movie: watched_movie.movie }, { rating: 0, show: watched_show.show }])).toHaveLength(1);
    const rows = history_rows(
      [{ id: 11, watched_at: "2026-01-01T00:00:00.000Z", movie: watched_movie.movie }],
      [{ id: 12, watched_at: "2026-02-01T00:00:00.000Z", show: watched_show.show, episode: { season: 2, number: 3, title: "Who Is Alive?" } }],
    );
    expect(rows.map((row) => [row.history_id, row.label])).toEqual([
      [12, "Severance 2x03 · Who Is Alive?"],
      [11, "Arrival"],
    ]);
  });
});

describe("Trakt", () => {
  it("signs in by device code, keeping the tokens and never giving the secret back", async () => {
    const { store } = open_methods();
    store.set_trakt_app("client-id", "client-secret");
    answers["POST api.trakt.tv/oauth/device/code"] = { body: { device_code: "device", user_code: "ABCD1234", verification_url: "https://trakt.tv/activate", expires_in: 600, interval: 5 } };
    let polls = 0;
    answers["POST api.trakt.tv/oauth/device/token"] = () => (++polls === 1 ? { status: 400, body: {} } : { body: { access_token: "access", refresh_token: "refresh", created_at: 1000, expires_in: 500 } });

    expect(await store.start_trakt_sign_in()).toMatchObject({ user_code: "ABCD1234" });
    expect(await store.poll_trakt_sign_in("device")).toEqual({ state: "pending" });
    expect(await store.poll_trakt_sign_in("device")).toEqual({ state: "authorized" });

    expect(store.get_trakt_status()).toEqual({ client_id: "client-id", has_client_secret: true, signed_in: true, expires_at: 1500 });
    expect(requests.at(-1)!.body).toMatchObject({ code: "device", client_id: "client-id", client_secret: "client-secret" });
    store.set_trakt_app("client-id", "");
    expect(store.get_trakt_status().has_client_secret).toBe(true);
  });

  it("imports every page of what was watched, sending its Client ID trimmed and a User-Agent", async () => {
    const { store } = signed_in_to_trakt();
    answers["GET api.trakt.tv/sync/watched/movies"] = (_body, url) => ({ pages: 2, body: url.searchParams.get("page") === "1" ? [watched_movie] : [] });
    answers["GET api.trakt.tv/sync/watched/shows"] = { body: [watched_show] };

    expect(await store.run_source_import("trakt")).toEqual({ added: 2, updated: 0 });
    expect(requests.filter((request) => request.url.pathname === "/sync/watched/movies")).toHaveLength(2);
    expect(requests[0]!.headers).toMatchObject({ "trakt-api-key": "client-id", "User-Agent": expect.any(String), Authorization: "Bearer access" });
    expect(store.get_title("tmdb:95396")).toMatchObject({ watched_episodes: "s02e02", status: "watching" });
  });

  it("renews a token about to run out before reading", async () => {
    const { store } = signed_in_to_trakt();
    store.set_setting("trakt.expires_at", Math.floor(Date.now() / 1000) + 60);
    answers["POST api.trakt.tv/oauth/token"] = { body: { access_token: "renewed", refresh_token: "refresh-2", created_at: 2000, expires_in: 100 } };
    answers["GET api.trakt.tv/sync/watched/movies"] = { body: [] };
    answers["GET api.trakt.tv/sync/watched/shows"] = { body: [] };

    await store.import_trakt();

    expect(requests.at(-1)!.headers.Authorization).toBe("Bearer renewed");
    expect(store.get_settings()["trakt.expires_at"]).toBe(2100);
  });

  it("compares the history with the library, and removes a watch from Trakt only once the library holds it", async () => {
    const { store } = signed_in_to_trakt();
    const episode = { id: 21, watched_at: "2026-02-01T00:00:00.000Z", show: watched_show.show, episode: { season: 2, number: 3 } };
    answers["GET api.trakt.tv/sync/history/movies"] = { body: [] };
    answers["GET api.trakt.tv/sync/history/episodes"] = { body: [episode] };
    answers["POST api.trakt.tv/sync/history/remove"] = { body: { deleted: { episodes: 1 }, not_found: { ids: [] } } };

    const before = await store.lookup_trakt_history();
    expect(before).toMatchObject({ total: 1, captured: 0, missing: 1 });
    await expect(store.remove_trakt_watch(before.rows[0]!)).rejects.toThrow(/does not hold that watch/);
    expect(requests.some((request) => request.url.pathname === "/sync/history/remove")).toBe(false);

    await store.import_trakt_watch(before.rows[0]!);
    expect((await store.lookup_trakt_history()).captured).toBe(1);
    await store.remove_trakt_watch(before.rows[0]!);
    expect(requests.at(-1)!.body).toEqual({ ids: [21] });
  });

  it("archives every list whole, naming the ones that failed, and applies ratings only to titles it holds", async () => {
    const { store } = signed_in_to_trakt();
    answers["GET api.trakt.tv/sync/watched/movies"] = { body: [watched_movie] };
    answers["GET api.trakt.tv/sync/watched/shows"] = { body: [] };
    answers["GET api.trakt.tv/sync/ratings/movies"] = { body: [{ rating: 8, movie: watched_movie.movie }, { rating: 6, movie: { title: "Unseen", ids: { tmdb: 5 } } }] };
    for (const list of ["history/movies", "history/episodes", "ratings/shows", "ratings/seasons", "ratings/episodes", "watchlist/movies", "watchlist/shows", "collection/movies"]) {
      answers[`GET api.trakt.tv/sync/${list}`] = { body: [] };
    }

    const report = await store.archive_trakt();

    expect(report).toMatchObject({ added: 1, ratings_applied: 1, counts: { watched_movies: 1, ratings_movies: 2, collection_shows: null } });
    expect(report.failures).toEqual([expect.stringMatching(/^collection_shows:/)]);
    expect(store.get_title("tmdb:329865")!.rating).toBe(8);
    expect(store.get_title("tmdb:5")).toBeNull();
    const [archive] = store.list_trakt_archives();
    expect(JSON.parse(store.export_trakt_archive(archive!.id)).data.ratings_movies).toHaveLength(2);
  });

  it("refuses its calls while its plugin is off, and leaves it out of the sources", async () => {
    const { store } = signed_in_to_trakt();
    store.set_setting("plugins", { "x-media-tracker.trakt": { enabled: false } });

    await expect(store.import_trakt()).rejects.toThrow(/Trakt plugin is off/);
    expect((await store.list_sources()).map((source) => source.id)).toEqual(["stremio"]);
    await expect(store.run_source_import("trakt")).rejects.toThrow("No source named trakt is on.");
  });
});

// ── Stremio ──────────────────────────────────────────────────────────────────

describe("Stremio", () => {
  it("reads the library: watched movies, shows up to the episode last played, and removed titles only once started", () => {
    const items = items_from_stremio([
      { _id: "tt2543164", type: "movie", name: "Arrival", state: { timesWatched: 1, lastWatched: "2026-09-01T00:00:00Z" } },
      { _id: "tt0903747", type: "series", name: "Breaking Bad", state: { video_id: "tt0903747:2:3" } },
      { _id: "tt11280740", type: "series", name: "Severance", removed: true, state: { watched: "tt11280740:1:4:12:abc" } },
      { _id: "tt0000001", type: "movie", name: "Removed unseen", removed: true, state: {} },
      { _id: "local:1", type: "movie", name: "No IMDb id", state: {} },
      { _id: "tt0000002", type: "other", name: "A channel", state: {} },
    ]);
    expect(items.map((item) => [item.imdb_id, item.status, item.episodes?.length])).toEqual([
      ["tt2543164", "watched", undefined],
      ["tt0903747", undefined, 3],
      ["tt11280740", undefined, 4],
    ]);
  });

  it("signs in for a key without keeping the password, and imports", async () => {
    const { store } = open_methods();
    answers["POST api.strem.io/api/login"] = { body: { result: { authKey: "stremio-key" } } };
    answers["POST api.strem.io/api/datastoreGet"] = { body: { result: [{ _id: "tt0903747", type: "series", name: "Breaking Bad", state: { video_id: "tt0903747:1:2" } }] } };

    await store.sign_in_stremio("user@example.com", "a password");
    expect(JSON.stringify(store.get_settings())).not.toContain("a password");
    expect(store.get_stremio_status()).toEqual({ signed_in: true, email: "user@example.com" });

    expect(await store.import_stremio()).toEqual({ added: 1, updated: 0 });
    expect(requests.at(-1)!.body).toMatchObject({ authKey: "stremio-key", collection: "libraryItem" });
    expect(store.get_title("imdb:tt0903747")!.watched_episodes).toBe("s01e01-e02");
  });

  it("says what Stremio refused in its own words", async () => {
    const { store } = open_methods();
    answers["POST api.strem.io/api/login"] = { body: { error: { message: "Wrong passphrase" } } };
    await expect(store.sign_in_stremio("user@example.com", "wrong")).rejects.toThrow("Stremio: Wrong passphrase");
  });
});

// ── Schedule ─────────────────────────────────────────────────────────────────

describe("automatic imports", () => {
  it("run only the sources set to, once the hours have passed, and record a failure as a run", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-12T12:00:00Z"));
    const { store } = open_methods();
    expect(await store.run_due_imports()).toBeNull();

    store.set_setting("plugins", { "x-media-tracker.stremio": { settings: { auto_import: true } } });
    const run = await store.run_due_imports();
    expect(run).toEqual({ ran_at: "2026-11-12T12:00:00.000Z", result: "Stremio: Sign in to Stremio first." });

    vi.setSystemTime(new Date("2026-11-12T17:00:00Z"));
    expect(await store.run_due_imports()).toBeNull();
    vi.setSystemTime(new Date("2026-11-12T18:00:00Z"));
    expect(await store.run_due_imports()).not.toBeNull();
  });
});
