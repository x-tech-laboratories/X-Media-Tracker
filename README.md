# X-Media-Tracker

<a href="https://liberapay.com/BeatLink/donate"><img alt="Donate using Liberapay" src="https://liberapay.com/assets/widgets/donate.svg"></a> <a href="https://ko-fi.com/I4V52ANK6N"><img alt="Support me on Ko-fi" src="https://ko-fi.com/img/githubbutton_sm.svg"></a>

Movies, TV shows, books and games: what you plan to watch, read or play, are in the middle of, have finished or
dropped, with ratings, every episode ticked off, every read of a book with its days, a game's playtime and the
platforms you own it on, and your own collections. It runs as a web page
served by your own server, as a desktop app and as an Android app; the desktop and Android apps keep their own copy of
the library, work offline, and sync with the server whenever it can be reached. It is the X-Tech port of the Trilium
Media Tracker add-on.

The sidebar has a section for each: **Movies & Series**, **Books** and **Games**, each with its own pages, search in
the top bar and settings.

### Movies & Series

- **Library:** every title as a poster or a table row, narrowed by type, status, genre and each collection group, each
  choice showing how many titles it would leave; sorted by name, last watched, release, rating, when added or progress,
  and optionally grouped under headings by status, type, collection, genre, year or rating; the posters small, medium or
  large as set in Settings.
- **A title's page:** status, rating, collections, your notes in rich text, TMDB's overview and cast, and for a show every season's episodes to
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
  finish), format, owned and collection, each choice showing how many books it would leave, sorted, and optionally
  grouped under headings by status, format, author, series, collection, year or rating; the covers small, medium or
  large as set in Settings.
- **A book's page:** status, rating, format, owned, progress in pages, percent or audiobook minutes, collections, the
  review and your notes in rich text, every read with its start and finish days (a book read twice has two), a reading journal of dated notes, and
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
- **LibraryThing:** import its export, and export the library for LibraryThing's Goodreads import.

BookBrainz and Open Library need no key: search, covers, descriptions, series and new books by the authors you follow
come from them. A [Hardcover](https://hardcover.app) key, set under **Settings → Books → Catalogues**, adds Hardcover's
search, series in order and new books in the series you follow. Make the key with only the `read:catalog` scope (the
**Open Hardcover** link there ticks it for you), so it can read books but nothing of your account.

### Games

- **Statuses:** three groups, starting with IGDB's statuses: Want to play (Wishlist, Backlog), Playing (Currently
  playing, On hold, Endless, Replaying) and Played (Finished, Completed, Abandoned). **Settings → Games → Game
  statuses** renames, reorders and removes them and adds your own, such as Co-op under Playing; a removed status's
  games move to Backlog, Currently playing or Finished, or the group's first status once that is gone too.
- **Library:** every game as its box art or a table row, narrowed to games, DLC or both, by a status or a whole group,
  the platform you own it on and collection, each choice showing how many games it would leave, and sorted by title,
  last played, release, rating, playtime or when added, and optionally grouped under headings by status group, status,
  platform, store, collection, year or rating; the covers small, medium or large as set in Settings.
- **A game's page:** status, picked by group and then within it, rating, playtime and the day last played, edition, the platforms you own it on,
  collections, the review and your notes in rich text, with what the catalogues say of it and a link to each.
- **DLC:** a DLC or expansion names the game it adds to, linked from its page, and a game's page lists its DLC. Steam,
  RAWG, IGDB and GOG say which game a DLC belongs to when it is added or refreshed; **Change** beside **DLC of** sets it by
  hand, or marks a game as not DLC.
- **Search:** the bar at the top, in Games, searches your games, RAWG, IGDB, MobyGames, Giant Bomb, TheGamesDB,
  Steam's store, GOG and Wikidata at once, the same game from several catalogues shown once; a pasted RAWG, IGDB,
  MobyGames, Giant Bomb, TheGamesDB, Wikidata, Steam store, GOG store or itch.io game link is added at once.
- **Steam:** your library, with playtime and the day last played, and your wishlist, imported by hand or on a schedule,
  and your library's categories, each mapped to a status.
- **itch.io:** the games you have bought or claimed, imported by hand or on a schedule.
- **Epic Games Store:** the games your account owns, imported by hand or on a schedule.
- **Launchers:** a game's page starts it in Steam, Heroic, the Epic Games launcher, GOG Galaxy or Lutris.

Wikidata, Steam's store and GOG need no key; GOG is read through the answers its own store uses, which it does not
publish as an API, so they may change. Wikidata matters most: its items name a game's RAWG, MobyGames, Giant Bomb,
Steam, IGDB, TheGamesDB, GOG and SteamGridDB ids, so a game known to one catalogue, such as a game from your Steam
library, is found in the others. Keys for [RAWG](https://rawg.io/apidocs),
[MobyGames](https://www.mobygames.com/info/api/), [Giant Bomb](https://www.giantbomb.com/api/),
[TheGamesDB](https://forums.thegamesdb.net/) and [SteamGridDB](https://www.steamgriddb.com/profile/preferences/api),
and a [Twitch application](https://dev.twitch.tv/console)'s client id and secret for
[IGDB](https://api-docs.igdb.com/), each free for personal use and set under **Settings → Games → Catalogues**, add
that catalogue to search and details. SteamGridDB gives only art: a game's upright cover drawn by its users, found by
its Steam app or its title. Box art comes from MobyGames, Giant Bomb, IGDB or TheGamesDB when set, else from Steam's
or GOG's store art, else from SteamGridDB.

## Steam

Set a [Steam Web API key](https://steamcommunity.com/dev/apikey) and your Steam profile in **Settings → Games → Stores →
Steam**: its 64-bit id (shown at the top of store.steampowered.com/account), its custom URL name, or a link to it; the profile's **Game details** must be public. **Import library** adds
every game you own, owned on PC from Steam, as Currently playing once played and Backlog before; a game already here takes Steam's
playtime and last day played when they are later, leaves the Wishlist for the Backlog, and keeps its status unless it
was still wanted and has now been played. **Import wishlist** adds wished games as Wishlist, and leaves the
status of a game already here alone. With **Import automatically** on, both come in on the schedule under **Settings →
Movies & Series → Automatic imports**, with every other source set to. New games from Steam have their
names and box art at once; **Refresh** in Games fills in the rest from the catalogues.

Steam's Web API does not give your library's categories, so the **Categories** part of Steam's dialog reads them from
the Steam client's own file, `userdata/<account>/config/cloudstorage/cloud-storage-namespace-1.json` in Steam's folder:
the desktop app with **Read from this computer**, and every hour on its own, or any device with **Pick file…**. Each
category read is listed with a status to give its games, or **Leave as is**; every tracked game in a mapped category
then takes that status, the one furthest along when it is in several. Nothing is written back to Steam.

## itch.io

Make an [itch.io API key](https://itch.io/user/settings/api-keys) and set it in **Settings → Games → Stores → itch.io**.
**Import library** adds every game your account has bought or claimed, leaving out soundtracks, comics and tools, as
Backlog, owned from itch.io on PC, and on Android when it has an Android download; itch.io gives no playtime. A game
already here, by its itch.io page or else by its title when no itch.io page names it yet, gains the page, the store and
those platforms and leaves the Wishlist. With **Import automatically** on, it comes in on the sources' schedule, as for
Steam. A game's itch.io page is kept as its creator and slug, such as `innersloth/among-us`; its title,
creators, tags and cover are read from the page's `data.json`, which itch.io does not publish as an API, so it may change.

## Epic Games Store

Epic offers no API for a player's library, so the app reads it the way the
[Legendary](https://github.com/derrod/legendary) and Heroic launchers do, through the Epic Games launcher's own sign-in,
and it may stop working whenever Epic changes it. In **Settings → Games → Stores → Epic Games Store**, set the launcher's
client id and secret, found in Legendary's `legendary/api/egs.py`; then **Open sign-in page**, sign in to Epic, and
paste the `authorizationCode` the page shows, or its whole answer, into **Sign in**. **Import library** adds every game
the account owns, leaving out DLC, add-ons and Unreal Engine assets, as Backlog, owned from the Epic Games Store on PC;
Epic gives no playtime. A game already here, by its Epic catalogue item id or else by its title when no Epic id names it
yet, gains the id, the store and PC and leaves the Wishlist. With **Import automatically** on, it comes in on the
sources' schedule, as for Steam. Each import renews the sign-in; one left unused for long runs out, and then you sign in
again, so keep the schedule to a few hours.

EA's games cannot come in: EA offers no API for a player's library.

## Launchers

A game's page has a button for each launcher turned on under **Settings → Games → Launchers** that knows the game, and
it starts the game on the computer the page is open on; a browser asks first. **Launch in Steam** needs the game's Steam
app id. **Launch in Heroic** and **Launch in Epic Games launcher** need Epic's namespace and app name, which the Epic
import keeps. **Launch in Heroic** and **Open in GOG Galaxy** also work from GOG's product number, which refreshing a
game with a GOG id fills in; Galaxy opens the game's page, with its Play button. **Launch in Lutris** needs the game's
Lutris slug: the desktop app finds games installed in Lutris by their store's id or title, and **Change ids** sets the
slug, or any of the others, by hand. The buttons are left out on a phone.

## Coming from StoryGraph

StoryGraph has no API, so books travel through files. Export your library from StoryGraph's **Manage Account → Export
StoryGraph Library**, and pick the `.csv` under **Settings → Books → StoryGraph → Import StoryGraph**. Each book keeps
its status, read days, read count, rating (quarter stars rounded to the nearest half), review, format, owned, moods and
pace, and its tags become collections. A book already here, matched by ISBN or by title and author, gains what it lacks
and keeps its rating unless **Imports replace ratings** is on. Books from StoryGraph without an ISBN have no cover until
**Refresh** in Books finds them on Open Library.

**Export CSV** writes the library as a Goodreads library export, which StoryGraph's Goodreads import reads, as does
Hardcover's.

## Coming from LibraryThing

LibraryThing has no API for a library, so books travel through files too. Export your library from LibraryThing's
**Import/Export** page as tab-separated text or CSV, and pick it under **Settings → Books → LibraryThing → Import
LibraryThing**. Each book keeps its start and finish days, rating, review and format (from Media); it is Reading when
started but not finished or in **Currently reading**, Read when finished or in **Read but unowned**, else Want to read,
and owned when in **Your library**. Its other collections and its tags become collections. Books already here merge as
they do from StoryGraph.

LibraryThing's **Export CSV** writes the same Goodreads library export as StoryGraph's, which LibraryThing's Goodreads
import reads.

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

## Coming from IGDB

From IGDB, ask for your data under its **Settings → Privacy**, unzip what it sends, and pick its `index.html` under
**Settings → Games → IGDB → Import IGDB**. Want to Play, Playing and Played become statuses, an entry's own status
(such as Abandoned) winning, and a game in several lists takes the furthest along; your own lists become collections,
with ratings and reviews too. The export names no ids, so games are matched by title, and new ones have only their
title until **Refresh** in Games finds them on Wikidata.

## Importing from Trakt and Stremio

**Settings → Movies & Series → Sources** has a row for each source plugin, whose dialog signs in and imports. Imports only add and merge: a title is
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

Each source's dialog turns it on or off and sets it to import automatically, Trakt and Stremio here and Steam, itch.io
and the Epic Games Store under Games; **Settings → Movies & Series → Automatic imports** sets the hours between runs of
all of them (6 unless set). The server and the desktop app check hourly; the last
run syncs, so they do not both run it, and a failing source still counts as a run.

## Plugins

Every source and catalogue is a plugin bundled with the app, one per service, on the X-Libs plugin host: TMDB; Trakt
and Stremio; Open Library, Hardcover, BookBrainz, StoryGraph and LibraryThing; and RAWG, IGDB, MobyGames, Giant Bomb,
TheGamesDB, Steam, GOG, Wikidata, itch.io, SteamGridDB and the Epic Games Store. Each has a side in the store, which
provides its catalogue or importer, and a side in the page, a row in its section of Settings whose dialog holds its
switch, its settings and its panel. Keys are secret settings, never shown to other programs. On or off and their
settings are synced like any other setting, so a plugin turned off on one device is off everywhere, and its calls
refuse while it is off. Plugins run
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

### Covers

Every device keeps every cover and poster whole, so the library shows them offline. Whichever device or server first
sees a new or changed cover address downloads the image, and sync carries it to the others. A refresh that finds a new
address takes the image again. Posters are kept at TMDB's w780 width unless **Settings → Movies & Series → Kept poster
size** says otherwise; changing it downloads every poster again. Covers are not in the backups, since they can be taken
again. The server keeps them in a `covers` folder beside its database, the desktop app in its profile folder, and the
phone in its own storage.

## Backups

Every copy of the library backs itself up: daily by default, keeping the last 14, and always before a restore, before
a sync takes the other copy, and before an upgrade changes the database. **Settings → Backups** takes one by hand, sets
the schedule and lists every backup to restore or delete. The schedule belongs to that device or server and is never
synced. The desktop keeps them in `backups/` beside its database, Android in a folder you pick, and the server in
`backups_folder`, where only an admin sees them.

## Import and export

**Settings → Movies & Series**, **Books** and **Games** each have an **Import and export** section. **Export JSON**
saves the section whole in one file; **Export CSV** saves a zip with one CSV file per table, such as `titles.csv`,
`episodes.csv` and `collections.csv` for Movies & Series, `books.csv`, `reads.csv` and `journal.csv` for Books, and
`games.csv` for Games. Movies & Series holds the titles, watched episodes, collections and their groups; Books the
books, reads, journal, collections, follows and reading goals; Games the games and their collections. Covers are not
in the files and are fetched again from their addresses.

**Import…** reads a JSON export, a CSV zip, or its CSV files picked together, and never removes anything. New items are
added whole. An item already here, found by any id (or a book by its title and first author, a game by its title and
year), gains the file's episodes, reads, journal entries and collections and any field it has empty; a game keeps the
larger playtime and the later day last played. Where the file says otherwise of what is yours, such as a status,
rating, notes or owned platforms, the merge window opens for each such item in turn, with the file as a column: pick
what it keeps and **Save**, **Skip** it, or **Skip the rest**. `export_library_json`, `export_books_csv`,
`import_games_file` and the rest do the same through the API and MCP, answering the items to settle with `merge_titles`,
`merge_books` or `merge_games`.

**Settings → General → Import and export** saves every setting as one JSON file, and reads one back. Keys and tokens for
other services are left out unless **Include keys and tokens** is on; an import keeps the value of any setting the file
leaves out, so keys set here stay. Through MCP, `export_settings` always leaves keys and tokens out.

## Merging

**Merge…** on a title's, book's or game's page opens the merge window: the item as each tracked copy of it and each
catalogue knows it, side by side, one row per field. Click the value each field keeps; **Prefer** makes one column win
every field left alone, a field the preferred column lacks comes from the first column that has it, and **Keep all**
joins lists such as genres. **Other tracked copies** offers items that look like the same one, such as a game imported
from Steam and added again from RAWG, or finds one by name; once added, **Yours** compares your status, rating,
playtime and the rest, and **Keep** picks the copy that stays. Merging moves every read, journal entry, watched episode
and collection into it and removes the others; History can bring them back. With no other copy, it only picks the
item's details from the catalogues. `merge_titles`, `merge_books` and `merge_games` do the same through the API and MCP.

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

## Releases

CI builds the Android app after the tests pass on every push to `main`, kept as the run's `android` artifact. Pushing a
version tag such as `v1.2.3` also publishes it as a GitHub release, named for the tag, which
[Obtainium](https://obtainium.imranr.dev/) can follow for updates. The package is signed with the key in the
repository's `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD` and `ANDROID_KEY_ALIAS` secrets; without them a
build stays unsigned and a tag fails rather than publish it.

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
- [LibraryThing](https://www.librarything.com/): its library export is imported, and the export for it is written in
  the Goodreads format its importer reads.
- [BookNotification](https://www.booknotification.com/): its alerts for new books by the authors and series you follow
  inspired Upcoming and its alerts.
- [RAWG](https://rawg.io/): game details, through its API.
- [MobyGames](https://www.mobygames.com/): game details and box art, through its API.
- [Giant Bomb](https://www.giantbomb.com/): game details and box art, through its API.
- [IGDB](https://www.igdb.com/), of Twitch: game details and box art, through its API.
- [TheGamesDB](https://thegamesdb.net/): game details and box art, through its API.
- [GOG](https://www.gog.com/): game details and store art, through the answers its store uses.
- [SteamGridDB](https://www.steamgriddb.com/): box art drawn by its users, through its API.
- [Wikidata](https://www.wikidata.org/), of the Wikimedia Foundation: game details and the ids that link the other
  catalogues, under CC0.
- [Steam](https://store.steampowered.com/): game details, library art, and your library, playtime and wishlist.
- [itch.io](https://itch.io/): a game page's details and cover, and your library, through its API.
- [Epic Games Store](https://store.epicgames.com/): your library, its titles and box art, through the launcher's sign-in.

None of them endorse this app. The names are their owners' trademarks.

## License

GPL-3.0-or-later.
