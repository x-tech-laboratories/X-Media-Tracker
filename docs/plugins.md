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

## What the web side can reach

`PagePluginApi` is in `src/web/plugins.tsx`.

- The `panel` slot: a component drawn in the plugin's dialog below its settings, given the page's `settings` and
  `set_setting`.
- The `title_actions` slot: buttons beside a title's name, given its `media_type` and `imdb_id`.

A part that throws is left out without taking the page down.
