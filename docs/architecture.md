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
- `src/web/<feature>/index.tsx` exports its view, its pages for the sidebar, and its sections for the Settings page.

`src/shared/store.ts` and `src/web/features.tsx` list the features; nothing else knows them.

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

## Sources and plugins

Trakt and Stremio are bundled X-Libs plugins, each named once by a manifest in `src/shared/sources/manifests.ts`:

- The store's side (`src/shared/sources/store.ts`) provides an `importer` to a plugin host that `open_source_host`
  makes afresh for each use, so a plugin switched on any device holds at once. `list_sources`, `run_source_import` and
  `run_due_imports` go through it.
- Each source is also a feature, `src/shared/sources/<source>/`, with its calls and their specs, its settings (its keys
  and tokens listed as secret settings) and, for Trakt, its archive table. Its calls refuse while its plugin is off.
- The page's side (`src/web/sources/plugins.tsx`) fills the Import page's `import_panel` slot; Settings shows
  `PluginSettings`. Both hosts keep on or off and each plugin's settings in the synced `plugins` setting.
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
