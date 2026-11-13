# X-Media-Tracker

Movies and TV shows you plan to watch, are watching, have watched or dropped, with ratings, every episode ticked off,
and your own collections. It runs as a web page served by your own server, as a desktop app and as an Android app; the
desktop and Android apps keep their own copy of the library, work offline, and sync with the server whenever it can be
reached. It is the X-Tech port of the Trilium Media Tracker add-on, and imports its library.

- **Library:** every title as a poster or a table row, narrowed by type, status, genre and each collection group, each
  choice showing how many titles it would leave; sorted by name, last watched, release, rating, when added or progress,
  and optionally grouped under its collections.
- **A title's page:** status, rating, collections, TMDB's overview and cast, and for a show every season's episodes to
  tick off one at a time, the rest of a season, or the whole show at once. A show's status follows its episodes.
- **Search:** the bar at the top searches your library and TMDB at once, each TMDB result added with a button; a pasted
  TMDB or IMDb link is added at once.
- **Collections:** yours, a title in as many as you like, sorted into groups such as Mood or Franchise, each group its
  own filter on the Library.
- **Refresh:** fetches every title's details from TMDB again and settles each show's status; it never changes a rating
  or unwatches an episode.
- **Import:** from Trakt and Stremio, each a bundled plugin, by hand or on a schedule; one way and additive.

TMDB supplies search, posters, episode lists and details, and needs a free API key from
[themoviedb.org/settings/api](https://www.themoviedb.org/settings/api), set under **Settings → Library → TMDB**.

## Running it

```sh
nix-shell                 # Node 24 and an Electron that runs on NixOS
npm install
npm run hash-password -- admin password.hash  # an admin in password.hash, which the dev server reads
npm run dev:server        # the server on http://127.0.0.1:7750, with the data in dev-data/
npm run dev:web           # the page with live reload, reaching that server
npm run dev               # the desktop app, with its profile in dev-data/desktop
```

`npm run build` type-checks and builds the page into `out/web`; `npm start` serves it. `npm run build:desktop` builds
the desktop app into `out/`, and `npm run build:android` builds the phone's page and copies it into `android/`
(build the app itself in `nix develop .#android` with `cd android && ./gradlew assembleDebug`). `npm run icons` draws
every icon again from `resources/icon.svg`.

## Configuration

The server reads a JSON file named by `X_MEDIA_TRACKER_CONFIG`; `config.example.json` is the complete default:

| Field            | Means                                                     |
| ---------------- | --------------------------------------------------------- |
| `database`       | the SQLite file, made if missing                          |
| `backups_folder` | where the server's backups are kept                       |

The address and port come from `X_MEDIA_TRACKER_HOST` and `X_MEDIA_TRACKER_PORT` (or `--host` and `--port`),
127.0.0.1:7750 unless set. The admins are read from the accounts file `X_MEDIA_TRACKER_PASSWORD_HASH_FILE` names, one
`name:hash` line each; `npm run hash-password -- <name> <file>` adds one or changes their password.
`x-media-tracker --help` lists every option.

## Coming from Trilium

Open the add-on's `Database` note under your Library Root, save its text as a `.json` file, and pick it under
**Settings → Library → Import and export → Import Trilium**. To keep your collection groups, paste the add-on's
`collectionGroups` setting from its config note into the field above first. Titles keep their ids (such as
`tmdb:693134`), status, rating, watched episodes, dates and collections; an import adds new titles and merges ones
already here without changing their status or rating. **Export JSON** writes the library back in the same shape.


## Importing from Trakt and Stremio

**Settings → Sources → Import** shows a panel for each source plugin that is on. Imports only add and merge: a title is
matched on any shared id (TMDB, IMDb or Trakt), episodes are merged and never unwatched, and status and rating are kept
unless **Settings → Library → New titles** and the import settings say otherwise. Nothing is ever written to Stremio.

- **Trakt:** make an API app at [trakt.tv/oauth/applications](https://trakt.tv/oauth/applications) with
  `urn:ietf:wg:oauth:2.0:oob` as its redirect address, save its Client ID and Secret, then **Sign in to Trakt** and enter
  the code it shows at Trakt's address. **Import from Trakt** brings in watched movies and every watched episode.
- **Leaving Trakt:** **Archive everything** reads every list Trakt holds (watched, full history with each watch's time,
  ratings, watchlist, collection) and keeps Trakt's answers whole, then imports what was watched and the ratings of
  titles already here. It names any list that failed; delete nothing while one did. **Export** saves an archive as a
  file. **Compare with Trakt** shows Trakt's whole history beside the library: **Import** brings in one watch the library
  lacks, and **Remove from Trakt** deletes one watch from Trakt by its history id, refused unless the library holds it.
  Trakt has no undo.
- **Stremio:** sign in with the account's email and password; the password is sent once for a key and kept nowhere.
  Stremio keeps only where each show is up to, so a show's episodes up to the one last played count as watched.

**Settings → Sources → Plugins** turns each source on or off and sets it to import automatically; **Settings → Sources →
Automatic imports** sets the hours between runs (6 unless set). The server and the desktop app check hourly; the last
run syncs, so they do not both run it, and a failing source still counts as a run.

## Plugins

Trakt and Stremio are plugins bundled with the app, on the X-Libs plugin host: each has a side in the store, which
provides its importer, and a side in the page, which draws its panel. On or off and their settings are synced like any
other setting, so a source turned off on one device is off everywhere, and its calls refuse while it is off. Plugins run
with the app's full rights; only bundled plugins are loaded.

## Signing in

A browser signs in with a name and password, the X-Libs accounts every X-app shares. Unless "Keep me signed in" is
ticked, the session ends when the browser closes; ticked, it lasts until it is signed out from **Your account**. There
each user changes their password, turns on a second factor, sees where they are signed in and makes tokens; an admin
adds users on **Users**.

## Sync

In the desktop or Android app, open **Settings → This device → Sync**, enter the server's address, your name and
password, and choose whether this device starts from the server's library or the server from this device's. The copy
that loses is backed up first. After that, changes go both ways within seconds, and a device that is offline catches up
once it is back. A title's id is its strongest id, so a title added on two devices stays one.

## Backups

Every copy of the library backs itself up: daily by default, keeping the last 14, and always before a restore, before
a sync takes the other copy, and before an upgrade changes the database. **Settings → Backups** takes one by hand, sets
the schedule and lists every backup to restore or delete. The schedule belongs to that device or server and is never
synced. The desktop keeps them in `backups/` beside its database, Android in a folder you pick, and the server in
`backups_folder`, where only an admin sees them.

## History

Every change to a title (its watched episodes and collections included) and to a collection is kept as a version,
whichever device, page, API call or MCP tool made it. **History** in the sidebar lists the latest changes; any version
can be restored, and a removed title brought back with its episodes. Versions sync. Changes older than
**Settings → General → History** (180 days unless set) are pruned, each item keeping its latest.

Collection groups are left out: a group is a heading for collections, and removing one keeps its collections. Trakt
archives are left out too: each is a copy of Trakt's answers, never edited.

## Other programs: the API and MCP

Every call the page makes is open to other programs on the server, behind a token made on **Your account** and sent as
`Authorization: Bearer <token>`:

- **API:** `POST /api/call/<method>` with the arguments as a JSON list in order, or by name as a JSON object.
  `GET /api/openapi.json` describes every call.
- **MCP:** `/api/mcp` serves every call as a tool over streamable HTTP, the calls that only read marked read-only:

  ```sh
  claude mcp add --transport http x-media-tracker https://<server>/api/mcp --header "Authorization: Bearer <token>"
  ```

The TMDB key, the Trakt secret and tokens and the Stremio key are left out of what MCP reads.

## NixOS

```nix
inputs.x-media-tracker.url = "github:x-tech-laboratories/X-Media-Tracker";

imports = [ x-media-tracker.nixosModules.default ];
services.x-media-tracker = {
  enable = true;
  passwordHashFile = "/etc/x-media-tracker/password-hash";
};
```

`packages.default` is the server and `packages.desktop` the desktop app.

## Layout

```
src/
  server/    Fastify app and main.ts
  main/      Electron main process: its database, the page's calls, sync
  preload/   the desktop page's bridge
  web/       the React page, one folder per feature, and hosts/ for web, desktop and Android
  shared/    the store every host runs, one folder per feature, and the bridge's method tables
tests/       one *.test.ts per behaviour
docs/        architecture.md
nix/         package.nix, desktop-package.nix, module.nix
```

## License

GPL-3.0-or-later. Film and TV details and images come from [TMDB](https://www.themoviedb.org/); this product uses the
TMDB API but is not endorsed or certified by TMDB.
