import { describe, expect, it } from "vitest";

import {
  episodes_in,
  facet_counts,
  filter_titles,
  format_episodes,
  next_unwatched,
  no_filters,
  normalize_names,
  parse_episodes,
  parse_media_link,
  sort_titles,
  status_from_progress,
  title_key,
  type Collection,
  type LibraryTitle,
} from "../src/shared/library/model.ts";

function title(fields: Partial<LibraryTitle> & Pick<LibraryTitle, "id" | "name">): LibraryTitle {
  return {
    tmdb_id: "",
    imdb_id: "",
    trakt_id: "",
    other_ids: {},
    media_type: "movie",
    year: "",
    overview: "",
    poster_path: "",
    cover_file: "",
    cover_file_from: "",
    genres: "",
    runtime: 0,
    status: "planned",
    rating: null,
    notes: "",
    last_watched: "",
    total_episodes: 0,
    added_at: "",
    collection_ids: [],
    watched_count: 0,
    watched_episodes: "",
    ...fields,
  };
}

describe("episode runs", () => {
  it("reads runs and single episodes, and writes them back sorted and collapsed", () => {
    const seasons = parse_episodes("s02e03-e05, s01e01-e03,s01e05,junk,s02e01");
    expect([...seasons.get(1)!]).toEqual([1, 2, 3, 5]);
    expect(format_episodes(seasons)).toBe("s01e01-e03,s01e05,s02e01,s02e03-e05");
    expect(format_episodes(parse_episodes(""))).toBe("");
  });

  it("spells out ranges as single episodes and finds the first unwatched one", () => {
    expect(episodes_in([{ season: 1, from: 3, to: 2 }])).toEqual([
      { season: 1, episode: 2 },
      { season: 1, episode: 3 },
    ]);
    expect(next_unwatched(parse_episodes("s01e01-e10,s02e01"), { 1: 10, 2: 8 })).toEqual({ season: 2, episode: 2 });
    expect(next_unwatched(parse_episodes("s01e01-e02"), { 1: 2 })).toBeNull();
  });

  it("sets status from progress", () => {
    expect(status_from_progress(0, 10)).toBe("planned");
    expect(status_from_progress(3, 10)).toBe("watching");
    expect(status_from_progress(10, 10)).toBe("watched");
    expect(status_from_progress(2, 0)).toBe("watching");
  });
});

describe("ids and links", () => {
  it("keys a title by its strongest id", () => {
    expect(title_key({ tmdb_id: "1", imdb_id: "tt1" })).toBe("tmdb:1");
    expect(title_key({ imdb_id: "tt1", trakt_id: "9" })).toBe("imdb:tt1");
    expect(title_key({})).toBe("");
  });

  it("reads TMDB and IMDb links and bare ids, ignoring slugs, paths and queries", () => {
    expect(parse_media_link("https://www.themoviedb.org/movie/693134-dune-part-two?language=en")).toEqual({ media_type: "movie", tmdb_id: "693134" });
    expect(parse_media_link("https://www.themoviedb.org/tv/95396-severance/season/2")).toEqual({ media_type: "show", tmdb_id: "95396" });
    expect(parse_media_link("https://www.imdb.com/title/TT15239678/")).toEqual({ imdb_id: "tt15239678" });
    expect(parse_media_link("tt15239678")).toEqual({ imdb_id: "tt15239678" });
    expect(parse_media_link("Dune")).toBeNull();
  });

  it("keeps one of each name whatever its case, the first spelling first", () => {
    expect(normalize_names([" MCU ", "mcu", "", 3, "Dune"])).toEqual(["MCU", "Dune"]);
  });
});

describe("sorting", () => {
  it("puts titles missing the value last in both directions, ties by name", () => {
    const titles = [title({ id: "a", name: "Alpha", rating: null }), title({ id: "b", name: "Beta", rating: 7 }), title({ id: "c", name: "Gamma", rating: 9 }), title({ id: "d", name: "Delta", rating: 7 })];
    expect(sort_titles(titles, "rating", false).map((each) => each.id)).toEqual(["b", "d", "c", "a"]);
    expect(sort_titles(titles, "rating", true).map((each) => each.id)).toEqual(["c", "b", "d", "a"]);
  });

  it("sorts shows by their progress", () => {
    const titles = [title({ id: "half", name: "Half", total_episodes: 10, watched_count: 5 }), title({ id: "most", name: "Most", total_episodes: 4, watched_count: 3 }), title({ id: "movie", name: "Movie" })];
    expect(sort_titles(titles, "progress", true).map((each) => each.id)).toEqual(["most", "half", "movie"]);
  });
});

describe("filters", () => {
  const collections: Collection[] = [
    { id: "mcu", name: "MCU", group_id: "franchise" },
    { id: "comfort", name: "Comfort", group_id: "mood" },
  ];
  const titles = [
    title({ id: "1", name: "Iron Man", genres: "Action", collection_ids: ["mcu", "comfort"], status: "watched" }),
    title({ id: "2", name: "Loki", media_type: "show", genres: "Drama, Action", collection_ids: ["mcu"] }),
    title({ id: "3", name: "Paddington", genres: "Comedy", collection_ids: ["comfort"] }),
  ];

  it("narrows by every filter, a group's none finding titles in no collection of that group", () => {
    expect(filter_titles(titles, { ...no_filters, search: "LO" }, collections).map((each) => each.id)).toEqual(["2"]);
    expect(filter_titles(titles, { ...no_filters, groups: { franchise: "none" } }, collections).map((each) => each.id)).toEqual(["3"]);
    expect(filter_titles(titles, { ...no_filters, genre: "action", groups: { mood: "comfort" } }, collections).map((each) => each.id)).toEqual(["1"]);
  });

  it("counts each choice narrowed by the other filters but not its own", () => {
    const counts = facet_counts(titles, { ...no_filters, media_type: "movie", groups: { mood: "comfort" } }, collections, ["franchise", "mood"]);
    expect(counts.media_type).toEqual({ all: 2, movie: 2 });
    expect(counts.groups.mood).toEqual({ all: 2, comfort: 2 });
    expect(counts.groups.franchise).toEqual({ all: 2, mcu: 1, none: 1 });
    expect(counts.genre).toEqual({ all: 2, action: 1, comedy: 1 });
  });
});
