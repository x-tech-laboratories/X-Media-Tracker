// A small library as the Trilium Media Tracker add-on keeps it, for tests that need titles without TMDB.

export const trilium_database = JSON.stringify({
  titles: {
    "tmdb:693134": {
      tmdbId: "693134",
      imdbId: "tt15239678",
      mediaType: "movie",
      title: "Dune: Part Two",
      year: "2024",
      poster: "https://image.tmdb.org/t/p/w342/dune.jpg",
      genres: "Science Fiction, Adventure",
      status: "watched",
      rating: 9,
      lastWatched: "2026-07-20",
      addedAt: "2026-07-01",
      collections: ["Dune"],
    },
    "tmdb:95396": {
      tmdbId: "95396",
      mediaType: "show",
      title: "Severance",
      year: "2022",
      genres: "Drama, Sci-Fi & Fantasy",
      status: "watching",
      watchedEpisodes: "s01e01-e09,s02e01",
      totalEpisodes: 19,
      addedAt: "2026-06-01",
      collections: ["Comfort", "Apple"],
    },
    "imdb:tt0903747": {
      imdbId: "tt0903747",
      mediaType: "show",
      title: "Breaking Bad",
      status: "planned",
      collection: "Crime",
    },
  },
});

export const trilium_groups = JSON.stringify({ groups: ["Mood", "Franchise"], assign: { Comfort: "Mood", Dune: "Franchise" } });
