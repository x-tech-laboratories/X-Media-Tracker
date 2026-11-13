// The library's settings and their defaults, in a file with no imports so the page can read them too.

export const library_setting_defaults = {
  // A free TMDB key, which search, posters, episode lists and details need.
  "library.tmdb_api_key": "",
  // The status a title added by hand starts with.
  "library.default_status": "planned",
  // TMDB's image width for posters, such as w342.
  "library.poster_size": "w342",
  // Whether the Library filters by TMDB's genres and the details page shows them.
  "library.genres_enabled": true,
  // Genres left out of the Library's genre filter.
  "library.hidden_genres": [] as string[],
  // Whether an import marks a title watched, or a show watching, from its history.
  "library.import_marks_watched": true,
  // Whether an import looks up each new title on TMDB for its poster, overview and episodes.
  "library.import_fetch_metadata": true,
  // Whether an import's rating replaces one already set.
  "library.import_overwrite_ratings": false,
};

// Settings that hold another service's key, kept out of what other programs read.
export const library_secret_settings = ["library.tmdb_api_key"];
