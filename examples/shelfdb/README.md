# ShelfDB, an example plugin

A game catalogue for X-Media-Tracker in plain JavaScript, with no dependencies and no build. Copy this folder into the
`plugins/` folder beside the server's database, or into the desktop app's profile, and restart: ShelfDB shows under
**Settings → Plugins**, its games appear in search, and **Change ids** on a game takes a ShelfDB id.

- `package.json` names each side's file under `x-plugin`.
- `store.js` provides the `game_catalog`; `web.js` gives the plugin its settings row.
- `manifest.js` is the manifest both share.

A plugin that needs libraries bundles each side into one file with a tool such as esbuild and points `x-plugin` at the
output. See [docs/plugins.md](../../docs/plugins.md).
