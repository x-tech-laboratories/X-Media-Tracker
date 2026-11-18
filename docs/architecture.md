# How X-Media-Tracker is put together

## One page, three hosts

The page in `src/web` is the same React tree everywhere. At start, `src/web/main.tsx` picks the host it runs on and hands
the page a `PageApi` (`src/shared/page_api.ts`):

| Host    | Where the data is                                   | How a call travels                                   | Sync                        |
| ------- | --------------------------------------------------- | ---------------------------------------------------- | --------------------------- |
| web     | the server's SQLite file                            | `POST api/call/<method>` with the arguments as JSON  | none; the browser is online |
| desktop | `media.db` in Electron's profile folder             | IPC through the preload (`src/preload/index.ts`)     | X-Libs `sync_client`        |
| android | SQLite in WebAssembly, saved to IndexedDB           | straight to the store in the same page               | X-Libs `sync_client`        |

Views never ask which host they are on. They call `calls().<method>(...)` from `src/web/api.ts` and load with
`use_data`, which reloads quietly whenever `data_watch` is bumped: after this page writes, and when another page or
device changed something.

TMDB is asked from wherever the store runs: the server, Electron's main process, or the phone's page through
Capacitor's native HTTP, so no browser cross-origin rule applies.

## Features

A feature is two folders:

- `src/shared/<feature>/store.ts` exports a `define_feature({ id, migrations, tables, methods, api, setting_defaults })`.
  - Tables are written once in `schema.ts`; `npm run db:generate` writes each change as a migration under `migrations/`
    and bundles them into `migrations/index.ts`. A released migration is never edited.
  - `tables` lists the tables that sync, parents first, read by `synced_tables(...)` from the schema's primary keys.
  - `methods` take the database first, then the page's arguments, and run synchronously or return a promise. A method
    that only reads is named `list_`, `get_`, `search_`, `lookup_` or `export_`.
  - `api` describes every method for other programs in `src/shared/<feature>/api.ts`; the server serves them as MCP
    tools at `/api/mcp`, as `/api/openapi.json`, and lets `/api/call/<method>` take the arguments by name.
  - Settings keys are namespaced, such as `library.poster_size`, with their defaults in the feature's `settings.ts`.
- `src/web/<feature>/index.tsx` exports its view, its pages for the sidebar, its sections for the Settings page and
  anything it puts in the top bar, such as the library's search.

`src/shared/store.ts` and `src/web/features.tsx` list the features; nothing else knows them. Each entry in
`src/web/features.tsx` is a section of the sidebar, such as Movies & Series (`#/movies`, which `#/library` still opens)
and Books (`#/books`): its heading over its pages, its own search in the top bar while it is open, and its own category
on the Settings page.

## The library

`src/shared/library/`:

- `model.ts` holds the rules that need no database, and is the one library file the page imports for more than types:
  episode runs (`s01e01-e10,s02e01`), status from progress, title keys, pasted links, sorting, and the Library's
  filters with each choice's count narrowed by every other filter but its own.
- `schema.ts`: `library_titles`, keyed by the strongest id (`tmdb:…`, else `imdb:…`, else `trakt:…`) so two devices
  adding the same title make one row; `library_episodes`, one row per watched episode, so two devices ticking
  different episodes both keep theirs; `library_collections` with an optional `library_collection_groups` row, and
  `library_title_collections` between titles and collections.
- `tmdb.ts` is the TMDB client; `trilium.ts` reads and writes the Trilium add-on's Database note.
- A title is found by any shared id, so a title first known only by its IMDb id is matched once TMDB names it.

## Books

`src/shared/books/`:

- `model.ts` holds the rules that need no database, and is the books file the page imports for more than types:
  statuses and formats, which ids name one book, pasted links and ISBNs, progress, series order, sorting, the Books
  library's filters with counts, release days and a year's reading stats.
- `schema.ts`: `books_books`, keyed by the strongest id (`bookbrainz:…`, else `openlibrary:…`, else `hardcover:…`, else
  `isbn:…`; a StoryGraph book with none is `title:<title>/<author>`); `books_reads`, one row per time through a book;
  `books_journal`; `books_collections` and `books_book_collections`; `books_follows`, the authors and series followed;
  `books_releases`, the books found for them; and `books_goals`, one per year. All of them sync.
- `bookbrainz.ts`, `openlibrary.ts` and `hardcover.ts` are the catalogues' clients, each answering in `catalog.ts`'s
  shape. Adding a book asks BookBrainz, then Open Library (whose work names its BookBrainz work, and BookBrainz its Open
  Library work), then Hardcover when a key is set, each filling what the one before lacks; search asks them all at once
  and joins the same book into one result. Hardcover is reached only with the user's key from settings, which never
  appears in an error or a log.
- `storygraph.ts` reads StoryGraph's export CSV and writes the Goodreads library CSV StoryGraph imports; `csv.ts` reads
  and writes CSV.
- `schedule.ts` runs `run_release_check` hourly on the server and the desktop; the check's last run syncs, so they do
  not both run it. A follow's first check stores what it finds as already alerted. The server's
  `src/server/book_alerts.ts` then sends one alert per book still unalerted through X-Libs' `server/notify` channels,
  so books found on any device are announced once, by the server.

## Games

`src/shared/games/`:

- `model.ts` holds the rules that need no database, and is the games file the page imports for more than types:
  statuses, which ids name one game, pasted links, platforms, playtime, sorting and the Games library's filters with
  counts.
- `schema.ts`: `games_games`, keyed by the strongest id (`rawg:…`, else `mobygames:…`, `giantbomb:…`, `wikidata:…`,
  `steam:…`, `igdb:…`; a Trilium game with none is `title:<title>/<year>`), with the platforms a copy is owned on as a
  JSON list and, for DLC, `base_game`: the key of the game it adds to, such as `steam:620`, or a library id, found among
  the tracked games by any id (`find_base_game` in `model.ts`); `none` once set by hand as not DLC, so the catalogues
  stop filling it in. `games_collections` and `games_game_collections`. All of them sync.
- `rawg.ts`, `mobygames.ts`, `giantbomb.ts`, `wikidata.ts` and `steam.ts` are the catalogues' clients, each answering in
  `catalog.ts`'s shape. Adding or refreshing a game asks Wikidata first, by any id known, for the ids every other
  catalogue gives it, then RAWG, MobyGames and Giant Bomb (each only with its key) and Steam's store by their own ids;
  words come from the richest catalogue first and box art from the one best at it. Search asks them all at once and
  joins the same game into one result. Wikidata and MobyGames are asked one request at a time, as they ask; the keys
  come from settings and never appear in an error or a log.
- `steam.ts` also reads a profile's owned games, with playtime, and its wishlist; `schedule.ts` runs `run_steam_sync`
  hourly on the server and the desktop, and the last import syncs, so they do not both run it. Steam is not a source
  plugin, since those import into Movies & Series.
- `trilium.ts` reads the Trilium Game Tracker add-on's Database note and the statuses from its config note.
- `igdb_export.ts` reads IGDB's data export page, by its tables' headers and without a DOM: lists as statuses or
  collections, ratings and reviews, each game by its title alone.

## Sources and plugins

Trakt and Stremio are bundled X-Libs plugins, each named once by a manifest in `src/shared/sources/manifests.ts`:

- The store's side (`src/shared/sources/store.ts`) provides an `importer` to a plugin host that `open_source_host`
  makes afresh for each use, so a plugin switched on any device holds at once. `list_sources`, `run_source_import` and
  `run_due_imports` go through it.
- Each source is also a feature, `src/shared/sources/<source>/`, with its calls and their specs, its settings (its keys
  and tokens listed as secret settings) and, for Trakt, its archive table. Its calls refuse while its plugin is off.
- The page's side (`src/web/sources/plugins.tsx`) fills the `import_panel` slot in Settings' Sources category, beside
  `PluginSettings` and the automatic imports' schedule (`src/web/sources/SourceSettings.tsx`). Both hosts keep on or
  off and each plugin's settings in the synced `plugins` setting.
- Every source imports through `apply_import` (`src/shared/library/importing.ts`): TMDB is asked first, then one
  transaction writes, matching on any id and merging episodes.
- `keep_importing` (`src/shared/sources/schedule.ts`) checks the automatic imports hourly on the server and the desktop.

## History

`src/shared/history/store.ts` keeps a version of every title (with its episodes and collections) and every collection
a write touches through X-Libs `create_history`. `bind_methods` records after every write, so the page, the API and MCP
are all covered; writes that arrive by sync are left to the device that made them.

## Sync

The server and every device run the same store. X-Libs `sync_engine` stamps every write to a synced table through
triggers, value by value; the newest write of each value wins. A device sends its changes within seconds and takes
everyone else's in the same round trip, follows the server's event stream to hear of changes at once, and keeps working
offline. On first connecting, the user chooses whether the server's copy or the device's wins; the other is backed up.

## Covers

`src/shared/covers.ts` keeps every game's and book's cover and every title's poster on every device. `games_games`,
`books_books` and `library_titles` each have `cover_file`, the name of a file synced through X-Libs `sync_files` (the
sha256 of its bytes), and `cover_file_from`, the address it was taken from, or `custom` for one set by hand, which is
never replaced. `keep_fetching_covers` runs on the server, the desktop and the phone. Every minute, and soon after a
write, it downloads the image of each row whose address differs from `cover_file_from`; a title's address is its poster
at `library.saved_poster_size`. The sync client is given `referenced_covers`, so after each exchange it sends the
server the files it lacks and fetches the ones the device lacks. The page shows a kept cover through `use_cover`
(`src/web/covers.tsx`), with `PageApi.cover_src` naming where each host serves it from: the server's
`api/sync/files/<name>`, the desktop's `x-media-cover://<name>` scheme, or a blob address on the phone. It falls back to
the address until the file is there.
