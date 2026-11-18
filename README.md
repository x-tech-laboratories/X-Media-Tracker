# X-Media-Tracker

<a href="https://liberapay.com/BeatLink/donate"><img alt="Donate using Liberapay" src="https://liberapay.com/assets/widgets/donate.svg"></a> <a href="https://ko-fi.com/I4V52ANK6N"><img alt="Support me on Ko-fi" src="https://ko-fi.com/img/githubbutton_sm.svg"></a>

Movies, TV shows, books and games: what you plan to watch, read or play, are in the middle of, have finished or
dropped, with ratings, every episode ticked off, every read of a book with its days, a game's playtime and the
platforms you own it on, and your own collections. It runs as a web page
served by your own server, as a desktop app and as an Android app; the desktop and Android apps keep their own copy of
the library, work offline, and sync with the server whenever it can be reached. It is the X-Tech port of the Trilium
Media Tracker add-on, and imports its library.

The sidebar has a section for each: **Movies & Series**, **Books** and **Games**, each with its own pages, search in
the top bar and settings.

### Movies & Series

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
[themoviedb.org/settings/api](https://www.themoviedb.org/settings/api), set under **Settings → Movies & Series → TMDB**.


### Books

- **Library:** every book as a cover or a table row, narrowed by status (Want to read, Reading, Paused, Read, Did not
  finish), format, owned and collection, each choice showing how many books it would leave, and sorted.
- **A book's page:** status, rating, format, owned, progress in pages, percent or audiobook minutes, collections, the
  review, every read with its start and finish days (a book read twice has two), a reading journal of dated notes, and
  the series in order with what you have read and a button to add the rest.
- **Search:** the bar at the top, in Books, searches your books, Open Library, BookBrainz and Hardcover at once, the same
  book from several catalogues shown once; a pasted BookBrainz, Open Library or Hardcover link or an ISBN is added at
  once.
- **Upcoming:** follow authors and series, from a book's page or a search, and their new books are looked for on a
  schedule: books coming soon first, those you have not looked at marked new. The server can send an alert for each
  new book by ntfy, a webhook or email.
- **Goals & stats:** a yearly goal in books, and how far along it is against an even pace; books and pages by month,
  ratings, formats and top genres.
- **StoryGraph:** import its export, and export the library for StoryGraph to import.

BookBrainz and Open Library need no key: search, covers, descriptions, series and new books by the authors you follow
come from them. A [Hardcover](https://hardcover.app) key, set under **Settings → Books → Catalogues**, adds Hardcover's
search, series in order and new books in the series you follow. Make the key with only the `read:catalog` scope (the
**Open Hardcover** link there ticks it for you), so it can read books but nothing of your account.

### Games

- **Statuses:** IGDB's, in three groups: Want to play (Wishlist, Backlog), Playing (Currently playing, On hold,
  Endless, Replaying) and Played (Finished, Completed, Abandoned).
- **Library:** every game as its box art or a table row, narrowed to games, DLC or both, by a status or a whole group,
  the platform you own it on and collection, each choice showing how many games it would leave, and sorted by title,
  last played, release, rating, playtime or when added.
- **A game's page:** status, picked by group and then within it, rating, playtime and the day last played, edition, the platforms you own it on,
  collections and the review, with what the catalogues say of it and a link to each.
- **DLC:** a DLC or expansion names the game it adds to, linked from its page, and a game's page lists its DLC. Steam
  and RAWG say which game a DLC belongs to when it is added or refreshed; **Change** beside **DLC of** sets it by
  hand, or marks a game as not DLC.
- **Search:** the bar at the top, in Games, searches your games, RAWG, MobyGames, Giant Bomb, Steam's store and
  Wikidata at once, the same game from several catalogues shown once; a pasted RAWG, MobyGames, Giant Bomb, Wikidata
  or Steam store link is added at once.
- **Steam:** your library, with playtime and the day last played, and your wishlist, imported by hand or on a schedule,
  and your library's categories, each mapped to a status.

Wikidata and Steam's store need no key. Wikidata matters most: its items name a game's RAWG, MobyGames, Giant Bomb,
Steam and IGDB ids, so a game known to one catalogue, such as a game from your Steam library, is found in the others.
Keys for [RAWG](https://rawg.io/apidocs), [MobyGames](https://www.mobygames.com/info/api/) and
[Giant Bomb](https://www.giantbomb.com/api/), each free for personal use and set under **Settings → Games →
Catalogues**, add that catalogue to search and details. Box art comes from MobyGames or Giant Bomb when set, else from
Steam's library art.

## Steam

Set a [Steam Web API key](https://steamcommunity.com/dev/apikey) and your Steam profile under **Settings → Games →
Steam**: its 64-bit id (shown at the top of store.steampowered.com/account), its custom URL name, or a link to it; the profile's **Game details** must be public. **Import library** adds
every game you own, owned on PC, as Currently playing once played and Backlog before; a game already here takes Steam's
playtime and last day played when they are later, leaves the Wishlist for the Backlog, and keeps its status unless it
was still wanted and has now been played. **Import wishlist** adds wished games as Wishlist, and moves a game in the
Backlog you own nowhere to the Wishlist. With **Import from Steam every** set to some hours, the server and the desktop
app import both on that schedule; the last import syncs, so they do not both run it. New games from Steam have their
names and box art at once; **Refresh** in Games fills in the rest from the catalogues.

Steam's Web API does not give your library's categories, so **Settings → Games → Steam categories** reads them from
the Steam client's own file, `userdata/<account>/config/cloudstorage/cloud-storage-namespace-1.json` in Steam's folder:
the desktop app with **Read from this computer**, and every hour on its own, or any device with **Pick file…**. Each
category read is listed with a status to give its games, or **Leave as is**; every tracked game in a mapped category
then takes that status, the one furthest along when it is in several. Nothing is written back to Steam.

## Coming from StoryGraph

StoryGraph has no API, so books travel through files. Export your library from StoryGraph's **Manage Account → Export
StoryGraph Library**, and pick the `.csv` under **Settings → Books → StoryGraph → Import StoryGraph**. Each book keeps
its status, read days, read count, rating (quarter stars rounded to the nearest half), review, format, owned, moods and
pace, and its tags become collections. A book already here, matched by ISBN or by title and author, gains what it lacks
and keeps its rating unless **Imports replace ratings** is on. Books from StoryGraph without an ISBN have no cover until
**Refresh** in Books finds them on Open Library.

**Export CSV** writes the library as a Goodreads library export, which StoryGraph's Goodreads import reads, as does
Hardcover's.

## Alerts for new books

The server and the desktop app look for new books by the authors and series you follow on the hours set under
**Settings → Books → New books and alerts** (24 unless set); the last check syncs, so they do not both run it.
Authors are looked up on Open Library and Hardcover, series on Hardcover only. Books already announced when you follow
someone fill Upcoming without an alert; books found later get one, sent by the server alone, so a book found on any
device is announced once, through:

- **ntfy:** a server (ntfy.sh unless set), a topic and an optional access token.
- **Webhook:** a POST of JSON with the book's title, authors, series, position, release day and link.
- **Email:** an SMTP server, port, STARTTLS, TLS or none, a user name and password, and the from and to addresses.

With no channel set, new books show only on Upcoming.

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
**Settings → Movies & Series → Import and export → Import Trilium**. To keep your collection groups, paste the add-on's
`collectionGroups` setting from its config note into the field above first. Titles keep their ids (such as
`tmdb:693134`), status, rating, watched episodes, dates and collections; an import adds new titles and merges ones
already here without changing their status or rating. **Export JSON** writes the library back in the same shape.


From IGDB, ask for your data under its **Settings → Privacy**, unzip what it sends, and pick its `index.html` under
**Settings → Games → IGDB → Import IGDB**. Want to Play, Playing and Played become statuses, an entry's own status
(such as Abandoned) winning, and a game in several lists takes the furthest along; your own lists become collections,
with ratings and reviews too. The export names no ids, so games are matched by title, and new ones have only their
title until **Refresh** in Games finds them on Wikidata.

For the Trilium Game Tracker add-on, save its `Database` note's text as a `.json` file and pick it under **Settings →
Games → Trilium Game Tracker → Import Trilium**. To keep the statuses you added in the add-on, such as Endless, pick its
`config.json` note first with **Pick config**; each becomes the status of its name, such as Endless, or else the
nearest status by its role and a collection of its name. Only the config's statuses are read; its Steam key stays on the page. Games keep their Steam id, status, rating,
playtime, days and collections; a game already here gains its playtime, days and collections and keeps its own status
and rating.

## Importing from Trakt and Stremio

**Settings → Sources → Import** shows a panel for each source plugin that is on. Imports only add and merge: a title is
matched on any shared id (TMDB, IMDb or Trakt), episodes are merged and never unwatched, and status and rating are kept
unless **Settings → Movies & Series → New titles** and the import settings say otherwise. Nothing is ever written to Stremio.

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
adds users under **Settings → Server → Users**.

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

The TMDB and Hardcover keys, the Trakt secret and tokens, the Stremio key and the alert channels' topic, tokens,
address and password are left out of what MCP reads.

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

## Credits

X-Media-Tracker is built on these services and the people who keep them:

- [TMDB](https://www.themoviedb.org/): film and TV details and images. This product uses the TMDB API but is not
  endorsed or certified by TMDB.
- [Trakt](https://trakt.tv/) and [Stremio](https://www.stremio.com/): watch history imported from each.
- [BookBrainz](https://bookbrainz.org/), the open book database of the MetaBrainz Foundation: works, authors, series
  and editions.
- [Open Library](https://openlibrary.org/), a project of the Internet Archive: book details, covers and authors' new
  books.
- [Hardcover](https://hardcover.app/): book details, series in order and upcoming books, through its API; its reading
  progress, re-reads, reading journal, goals and stats inspired the Books section's.
- [The StoryGraph](https://thestorygraph.com/): its library export is imported, and the export for it is written in the
  Goodreads format its importer reads.
- [BookNotification](https://www.booknotification.com/): its alerts for new books by the authors and series you follow
  inspired Upcoming and its alerts.
- [RAWG](https://rawg.io/): game details, through its API.
- [MobyGames](https://www.mobygames.com/): game details and box art, through its API.
- [Giant Bomb](https://www.giantbomb.com/): game details and box art, through its API.
- [Wikidata](https://www.wikidata.org/), of the Wikimedia Foundation: game details and the ids that link the other
  catalogues, under CC0.
- [Steam](https://store.steampowered.com/): game details, library art, and your library, playtime and wishlist.

None of them endorse this app. The names are their owners' trademarks.

## License

GPL-3.0-or-later.
