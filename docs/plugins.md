# Writing a plugin

X-Media-Tracker loads plugins from a folder as well as its bundled ones. A plugin from the folder runs with the app's
full rights and is not sandboxed, so install only plugins you trust.

## Where plugins go

- The server: `plugins/` beside its database.
- The desktop app: `plugins/` in its profile folder.
- The Android app loads none; a plugin turned on elsewhere is not run on the phone.

Each plugin is a subfolder holding a `package.json` and one bundled ES module per side:

```json
{
  "name": "x-media-tracker-shelf",
  "type": "module",
  "x-plugin": { "store": "dist/store.js", "web": "dist/web.js" }
}
```

- `store` runs wherever the store does: on the server and in the desktop app's main process. It provides importers.
- `web` runs in the page. It gives the plugin its row under **Settings → Plugins** and fills the page's slots. Give
  every plugin a web side, even one that only repeats its manifest, or it has no row to turn it on or off.

The folder is read when the server or the desktop app starts, so a new plugin shows after a restart. Each side's file
is one bundle; on the web side, `react` and `react/jsx-runtime` are the page's own, so leave them out of the bundle.

## The plugin

Both sides default-export a plugin made with X-Libs' `define_plugin`, the same manifest on each:

```ts
import { define_plugin } from "@x-tech-laboratories/x-libs/plugins";

export default define_plugin<MediaPluginApi>({
  id: "someone.shelf",
  name: "Shelf",
  version: "1.0.0",
  app: "x-media-tracker",
  app_versions: ">=0.2.0",
  description: "Imports the books on my shelf.",
  settings: [{ key: "api_key", label: "API key", type: "text", default: "", secret: true }],
  start: (context) => {
    context.provide("importer", "shelf", {
      label: "Shelf",
      is_ready: () => String(context.settings().api_key ?? "") !== "",
      run: async (database) => context.services.import_books(database, await read_my_shelf(String(context.settings().api_key))),
      imports_automatically: () => false,
    });
  },
});
```

On and off and the settings fields are kept in the synced `plugins` setting, so they hold on every device. A field
marked `secret` is drawn hidden and never shown to other programs.

## What the store side can reach

`MediaPluginApi` is in `src/shared/plugins/host.ts`.

- The `importer` provider: `label`, `is_ready(database)`, `run(database)` giving the counts added and updated, and
  `imports_automatically()`. An importer is listed by `list_sources`, run by `run_source_import` with its id, and runs
  on the automatic imports' schedule when `imports_automatically` says so.
- `context.services`, which writes into the library without reaching into the store:
  - `import_titles(database, items)`: movies and shows in the shape of `ImportItem` (`src/shared/library/importing.ts`),
    matched on any id, TMDB asked first for new ones, episodes merged.
  - `import_books(database, books)`: books in the shape of `ImportedBook` (`src/shared/books/storygraph.ts`), matched
    on their ISBN, else their title and author.
  - `import_games(database, games)`: games in the shape of `IgdbGame` (`src/shared/games/igdb_export.ts`), matched on
    their title.

Every import adds and merges and never removes anything.

### Game catalogues

The `game_catalog` provider is a `GameCatalog` (`src/shared/games/catalog.ts`), answering in `CatalogGame`'s shape:

```ts
context.provide("game_catalog", "shelfdb", {
  source: "shelfdb",
  label: "ShelfDB",
  missing: "",
  stage: "details",
  game: async (id) => ({ ...empty_game("shelfdb"), other_ids: { shelfdb: id }, title: "Outer Wilds", year: "2019" }),
  search: async (query) => [],
});
```

- `source` is the catalogue's own name, under which a game keeps its id in `other_ids`, such as `{ "shelfdb": "7" }`; a
  game known only by it is tracked as `shelfdb:7`. Pick a name no built-in catalogue uses.
- `missing` says why it cannot be asked, such as `"no key set"`, which search reports; `""` when it can.
- `stage` is when adding or refreshing a game asks it: `"ids"` first, `"details"`, or `"art"` last.
- `game(id)` answers about one game by its id there; `search(query)`, when given, joins search; `find(ids, known)`,
  when given, finds its own id for a game known by others.

Its answers fill in what the built-in catalogues lack and come before Wikidata's. Its ids travel with the library's
games files and stay with the game kept when games are merged.

### Book catalogues

The `book_catalog` provider is a `BookCatalog` (`src/shared/books/catalog.ts`), answering in `CatalogBook`'s shape:

```ts
context.provide("book_catalog", "shelfdb", {
  source: "shelfdb",
  label: "ShelfDB",
  missing: "",
  book: async (id) => ({ ...empty_book("shelfdb"), other_ids: { shelfdb: id }, title: "Piranesi", year: "2020" }),
  search: async (query) => [],
});
```

- `source` and `missing` are as for a game catalogue; a book known only by its id is tracked as `shelfdb:7`.
- `book(id)` answers about one book by its id there and `search(query)` joins search; `by_isbn(isbn)`, when given, is
  asked for a book with an ISBN but none of its ids.
- Authors and series are followed by the built-in catalogues' ids only, so `search_refs`, `series` and `releases` are
  left out.

Its answers fill in what BookBrainz, Open Library and Hardcover lack, and its ids travel with the books files and stay
with the book kept when books are merged.

### Movies and shows catalogues

The `title_catalog` provider is a `TitleCatalog` (`src/shared/library/plugins.ts`), answering in `CatalogTitle`'s shape:

```ts
context.provide("title_catalog", "shelfdb", {
  source: "shelfdb",
  label: "ShelfDB",
  missing: "",
  client: null,
  title: async (media_type, id) => ({ ...empty_title(media_type), other_ids: { shelfdb: id }, tmdb_id: "693134", name: "Dune: Part Two" }),
  search: async (query, media_type) => [],
});
```

- `client` is TMDB's own and stays `null`; cast, seasons and episode lists come only from TMDB.
- `title(media_type, id)` answers about one movie or show by its id there. Giving its `tmdb_id` or `imdb_id` lets TMDB
  fill in the rest, and TMDB's answer wins where both say something; without them the title is tracked as `shelfdb:7`.
- `poster_path` may be a whole address; a TMDB path such as `/abc.jpg` is sized by the page.
- `search(query, media_type)` joins the search page beside TMDB, the same title found by both shown once.

Its ids travel with the library's files and stay with the title kept when titles are merged.

## What the web side can reach

`PagePluginApi` is in `src/web/plugins.tsx`.

- The `panel` slot: a component drawn in the plugin's dialog below its settings, given the page's `settings` and
  `set_setting`.
- The `title_actions` slot: buttons beside a title's name, given its `media_type` and `imdb_id`.

A part that throws is left out without taking the page down.
