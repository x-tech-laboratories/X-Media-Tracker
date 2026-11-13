# X-Media-Tracker

Movies and TV shows you plan to watch, are watching, have watched or dropped, with ratings, every episode ticked off,
and your own collections. It runs as a web page served by your own server, as a desktop app and as an Android app; the
desktop and Android apps keep their own copy of the library, work offline, and sync with the server whenever it can be
reached. It is the X-Tech port of the Trilium Media Tracker add-on, and imports its library.

- **Library:** every title as a poster, narrowed by name, type, status, genre and each collection group, each choice
  showing how many titles it would leave; sorted by name, last watched, release, rating, when added or progress, and
  optionally grouped under its collections.
- **A title's page:** status, rating, collections, TMDB's overview and cast, and for a show every season's episodes to
  tick off one at a time, the rest of a season, or the whole show at once. A show's status follows its episodes.
- **Add:** search TMDB for movies, shows or both, or paste a TMDB or IMDb link to add it at once.
- **Collections:** yours, a title in as many as you like, sorted into groups such as Mood or Franchise, each group its
  own filter on the Library.
- **Refresh:** fetches every title's details from TMDB again and settles each show's status; it never changes a rating
  or unwatches an episode.

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

The Trakt and Stremio imports, the Trakt archive and the Trakt history comparison are not ported yet.

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

Collection groups are left out: a group is a heading for collections, and removing one keeps its collections.

## Other programs: the API and MCP

Every call the page makes is open to other programs on the server, behind a token made on **Your account** and sent as
`Authorization: Bearer <token>`:

- **API:** `POST /api/call/<method>` with the arguments as a JSON list in order, or by name as a JSON object.
  `GET /api/openapi.json` describes every call.
- **MCP:** `/api/mcp` serves every call as a tool over streamable HTTP, the calls that only read marked read-only:

  ```sh
  claude mcp add --transport http x-media-tracker https://<server>/api/mcp --header "Authorization: Bearer <token>"
  ```

The TMDB key is left out of what MCP reads.

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
