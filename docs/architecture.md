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
- `tmdb.ts` is the TMDB client.
- A title is found by any shared id, so a title first known only by its IMDb id is matched once TMDB names it.

## Books

`src/shared/books/`:

- `model.ts` holds the rules that need no database, and is the books file the page imports for more than types:
  statuses and formats, which ids name one book, pasted links and ISBNs, progress, series order, sorting, the Books
  library's filters with counts, release days and a year's reading stats.
- `schema.ts`: `books_books`, keyed by the strongest id (`bookbrainz:…`, else `openlibrary:…`, else `hardcover:…`, else
  `isbn:…`; a StoryGraph or LibraryThing book with none is `title:<title>/<author>`); `books_reads`, one row per time through a book;
  `books_journal`; `books_collections` and `books_book_collections`; `books_follows`, the authors and series followed;
  `books_releases`, the books found for them; and `books_goals`, one per year. All of them sync.
- `bookbrainz.ts`, `openlibrary.ts` and `hardcover.ts` are the catalogues' clients, each answering in `catalog.ts`'s
  shape. Adding a book asks BookBrainz, then Open Library (whose work names its BookBrainz work, and BookBrainz its Open
  Library work), then Hardcover when a key is set, each filling what the one before lacks; search asks them all at once
  and joins the same book into one result. Hardcover is reached only with the user's key from its plugin's settings, which
  never appears in an error or a log.
- `storygraph.ts` reads StoryGraph's export CSV and writes the Goodreads library CSV StoryGraph and LibraryThing
  import; `librarything.ts` reads LibraryThing's tab-separated or CSV export into the same shape, both through X-Libs'
  `csv`.
- `schedule.ts` runs `run_release_check` hourly on the server and the desktop; the check's last run syncs, so they do
  not both run it. A follow's first check stores what it finds as already alerted. The server's
  `src/server/book_alerts.ts` then sends one alert per book still unalerted through X-Libs' `server/notify` channels,
  so books found on any device are announced once, by the server.

## Games

`src/shared/games/`:

- `model.ts` holds the rules that need no database, and is the games file the page imports for more than types:
  the statuses in their three groups, IGDB's built in and the user's list in the synced `games.statuses` setting, with
  older or removed ones read as their nearest, which ids name one game, pasted links, platforms, playtime, sorting and the Games library's filters with
  counts.
- `schema.ts`: `games_games`, keyed by the strongest id (`rawg:…`, else `mobygames:…`, `giantbomb:…`, `wikidata:…`,
  `steam:…`, `igdb:…`, `thegamesdb:…`, `gog:…`, `steamgriddb:…`, `itchio:…`, `epic:…`; an IGDB game with none is `title:<title>`), with the platforms a copy is owned on and the
  stores it is owned from as JSON lists and, for DLC, `base_game`: the key of the game it adds to, such as `steam:620`, or a library id, found among
  the tracked games by any id (`find_base_game` in `model.ts`); `none` once set by hand as not DLC, so the catalogues
  stop filling it in. Its `status` column still defaults to an older status, read as Backlog, since changing a default
  rebuilds the table and would drop its collection links. `games_collections` and `games_game_collections`. All of them sync.
- `rawg.ts`, `igdb.ts`, `mobygames.ts`, `giantbomb.ts`, `thegamesdb.ts`, `gog.ts`, `steamgriddb.ts`, `wikidata.ts`,
  `steam.ts` and `itchio.ts` are the catalogues' clients, each answering in `catalog.ts`'s shape. Adding or refreshing a game asks
  Wikidata first, by any id known, for the ids every other catalogue gives it, then RAWG, IGDB, MobyGames, Giant Bomb
  and TheGamesDB (each only with its key), GOG, Steam's store and itch.io by their own ids, and last SteamGridDB (with its key)
  for art, by its id, the Steam app or else the title and year; words come from the richest catalogue first and box art
  from the one best at it. Adding or refreshing a game keeps the first box art that serves an image, so art a
  catalogue lists but no longer has gives way to the next catalogue's, then Steam's library art and a wide picture; the
  address of the image already kept is not asked again, and when none answers the best stays. A cover set by hand is marked `cover_by_hand` and no refresh replaces it. Search asks all but SteamGridDB at once and joins the same game into one result. Wikidata
  and MobyGames are asked one request at a time and IGDB four a second, as they ask; IGDB's Twitch access is asked for
  once and kept in memory. A GOG id is a store page's slug, as Wikidata keeps it without its `game/`, and the client
  reads the product number from that page. An itch.io id is a page as `creator/slug`, which Wikidata keeps as its link;
  itch.io has no search, so it answers only by that page's `data.json`. The keys come from each catalogue's plugin settings and never appear in an error or a log.
- `steam.ts` also reads a profile's owned games, with playtime, and its wishlist, and `itchio.ts` an account's owned
  keys through itch.io's API, page by page until one is empty, and `epic.ts` an Epic Games Store account's library
  through the launcher's sign-in, with the launcher's client id and secret from its plugin's settings, renewing the kept
  sign-in on every import and asking the catalogue only about games not yet tracked by their Epic id. The Steam,
  itch.io and Epic plugins provide these imports as importers, run on the sources' one schedule.
- `steam_collections.ts` reads the Steam client's library categories file; `import_steam_categories` gives games in a
  category mapped in `games.steam_category_statuses` its status. The desktop finds the file in Steam's folder
  (`src/main/steam_categories.ts`), offers it to the page through its own bridge and imports it on the Steam schedule.
- `launch.ts` makes a game's links into the launchers turned on in `games.launchers`: Steam by the Steam app id, Heroic
  and the Epic Games launcher by `epic_namespace` and `epic_app_name`, which the Epic import keeps, GOG Galaxy and Heroic
  by `gog_product_id`, which GOG's details give, and Lutris by `lutris_slug`. These never name a game in the library. The
  desktop reads the games installed in Lutris from its `pga.db` (`src/main/lutris.ts`) through its own bridge, so the
  page finds a game's slug there by its store's id or title, and its window lets each launcher's scheme out to the
  installed app. The page leaves the buttons out on a phone.
- `igdb_export.ts` reads IGDB's data export page, by its tables' headers and without a DOM: lists as statuses or
  collections, ratings and reviews, each game by its title alone.

## Plugins

Every source and catalogue is a bundled X-Libs plugin, one per service, each named once by a manifest: the sources' in
`src/shared/sources/manifests.ts`, the catalogues' in `src/shared/library/manifests.ts` (TMDB), `src/shared/books/manifests.ts` and
`src/shared/games/manifests.ts`. A manifest lists the
service's own settings, its keys marked `secret`.

- The store's side (`src/shared/plugins/host.ts`) is a plugin host that `open_plugin_host` makes afresh for each use, so
  a plugin switched on, or given a key, on any device holds at once. Plugins provide an `importer`, a `title_catalog`, a `book_catalog` or a `game_catalog`.
- Both hosts keep on or off and each plugin's settings in the synced `plugins` setting. `without_secret_settings`
  (`src/shared/settings.ts`) replaces each secret that is set with X-Libs' `hidden_secret` in what the server, the API
  and MCP give, and writing `plugins` back, or importing a settings file, gives a still hidden secret its stored value.
- A feature's `on_open` runs each time the database opens; the library's, books' and games' move the catalogue keys
  once kept as their settings into their plugins (`move_settings_into_plugins`).
- Plugins from a folder (`docs/plugins.md`) are loaded by the server from `plugins/` beside its database and by the
  desktop from its profile, with X-Libs' `load_plugin_folder` and their `store` side; `use_folder_plugins` adds them to
  every host after the bundled ones, and the host hands every plugin the `services` the store gives
  (`know_plugin_services` in `src/shared/store.ts`). The page imports their `web` side with `load_plugin_modules`: from
  the server's `/api/plugins/`, served by `register_plugin_files` behind sign-in, or on the desktop through the
  `plugin_files` bridge (`src/main/plugin_files.ts`). A phone loads none.
- The page's side (`src/web/plugins.tsx`) gives each plugin a row in its feature's settings, whose dialog shows its on or
  off, its settings and what it puts in the `panel` slot, such as Trakt's sign-in, IGDB's data export or the link to make a Hardcover key; Stremio
  also fills `title_actions` on each title's page.

Sources:

- `list_sources`, `run_source_import` and `run_due_imports` (`src/shared/sources/store.ts`) go through the importers of
  Trakt, Stremio, Steam, itch.io and the Epic Games Store; each importer gives the counts added and updated.
- Each source is also a feature, `src/shared/sources/<source>/`, with its calls and their specs, its settings (its keys
  and tokens listed as secret settings) and, for Trakt, its archive table. Its calls refuse while its plugin is off.
- Trakt and Stremio import through `apply_import` (`src/shared/library/importing.ts`): TMDB is asked first, then one
  transaction writes, matching on any id and merging episodes. The stores import into Games through the games store.
- StoryGraph and LibraryThing are plugins with no provider: their import calls refuse while they are off. IGDB's data
  export and Steam's categories likewise need the IGDB and Steam plugins.
- `keep_importing` (`src/shared/sources/schedule.ts`) checks the automatic imports hourly on the server and the desktop;
  `keep_reading_steam_categories` (`src/shared/games/schedule.ts`) reads Steam's categories file hourly on the desktop.

TMDB (`src/shared/library/plugins.ts`) provides the `title_catalog`: its client with the key from its settings, or
why it cannot be asked. `tmdb_of` refuses with that reason, or because the plugin is off, and `tmdb_if_ready` gives
null instead, for a refresh or an import that goes on without TMDB.

Book catalogues (`src/shared/books/plugins.ts`): each provides a `BookCatalog` (`src/shared/books/catalog.ts`) with
what it can do, such as a series in order or new books by a kind of follow. Adding or refreshing a book asks them from
the most curated, BookBrainz, then Open Library, then Hardcover, each by its own id or else the ISBN, and one skipped
is asked once another names its id; search asks them all, joined in the manifests' order.

Game catalogues (`src/shared/games/plugins.ts`): each provides a `GameCatalog` (`src/shared/games/catalog.ts`) built
with the key from its settings, or saying the key is missing, which search reports. Adding or refreshing a game asks the
catalogues that are on by stage: `ids` (Wikidata, which finds the ids the others know the game by), then `details`, each
by its own id, then `art` (SteamGridDB, which finds its own id from what the others said). Search asks each that has a
`search`, in the manifests' order.

## Merging

`src/shared/merging.ts` holds what merging shares: a catalogue's answer in a tracked row's own shape, and the checks
before a merge writes. Each feature's store has `lookup_<kind>_sources`, each catalogue's own answer from the same
lookups as adding, and `merge_<kind>s`, which writes the values picked onto the copy kept, moves the others' reads,
journal, episodes and collections to it, points DLC at it and removes them, in one transaction. The page's window is
`src/web/merging.tsx` on X-Libs' `MergeGrid`, with each feature's fields in `src/web/<feature>/merge.tsx`.

## Import and export

`src/shared/transfer.ts` moves a section in and out as tables: `transfer_file` writes them as one JSON export,
`transfer_csv` as one CSV file per table through X-Libs' `csv`, and `read_transfer` reads either back into rows typed
by each column, refusing another section's export. `meet_row` fills what a tracked item lacks and calls a different
value of a column the user keeps a conflict. Each feature's `transfer.ts` names its tables and the columns the user
keeps, and its `import_<kind>_file` matches items by any id, maps collections by name, adds episodes, reads and journal
entries without repeats, and answers the conflicts with the file's values. The page (`src/web/transfer.tsx`) zips and
unzips the CSV files through X-Libs' `zip`, and `settle_imported` opens the merge window for each conflict with the
file as a column. Settings travel on their own as `export_settings` and `import_settings`, which leave out the secret
settings each feature names unless asked.

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
