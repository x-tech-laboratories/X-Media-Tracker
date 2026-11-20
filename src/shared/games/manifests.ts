// The bundled game catalogue plugins as the plugin host knows them: their names, versions and settings, with each
// catalogue's key kept secret. The store and the page each start their own side of a plugin from the same manifest.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { PluginManifest, SettingField } from "@x-tech-laboratories/x-libs/plugins";

import { app_info, auto_import_field } from "../plugins/app.ts";
import type { SettingMove } from "../plugins/host.ts";

// ── Fields ───────────────────────────────────────────────────────────────────

function key_field(hint: string): SettingField {
  return { key: "api_key", label: "API key", hint, type: "text", default: "", placeholder: "Paste your key", secret: true };
}

function catalog(id: string, name: string, description: string, settings: SettingField[] = []): PluginManifest {
  return { id: `x-media-tracker.${id}`, name, version: app_info.version, app: app_info.id, description, settings };
}

// ── Catalogues ───────────────────────────────────────────────────────────────

export const rawg_manifest = catalog("rawg", "RAWG", "The largest catalogue: search, release days, genres and descriptions.", [key_field("A free key comes with an account at rawg.io/apidocs.")]);

export const igdb_manifest = catalog("igdb", "IGDB", "The biggest catalogue, with box art. Its API gives only the catalogue, so your IGDB lists come in through its data export.", [
  {
    key: "client_id",
    label: "Twitch client id",
    hint: "Register an application at dev.twitch.tv/console (free; Twitch asks for two-factor sign-in) and paste its client id and a new secret.",
    type: "text",
    default: "",
    placeholder: "Paste the client id",
  },
  { key: "client_secret", label: "Twitch client secret", hint: "The secret of the same Twitch application.", type: "text", default: "", placeholder: "Paste the client secret", secret: true },
]);

export const mobygames_manifest = catalog("mobygames", "MobyGames", "The most careful catalogue, with box art.", [
  key_field("A free key for personal use is under API on your MobyGames profile; it allows about one request a second."),
]);

export const giantbomb_manifest = catalog("giantbomb", "Giant Bomb", "Box art and short descriptions.", [key_field("A free key is on your Giant Bomb profile page.")]);

export const thegamesdb_manifest = catalog("thegamesdb", "TheGamesDB", "Strongest on console and older games, with box art.", [
  key_field("Ask for a free key on the forums at forums.thegamesdb.net; it allows so many requests a month."),
]);

export const steam_manifest = catalog("steam", "Steam", "Steam's store for search, details and art, your library with its playtime, your wishlist, and the status each of your Steam categories gives.", [
  { key: "api_key", label: "Steam Web API key", hint: "Reads the games a profile owns and their playtime. Get one at steamcommunity.com/dev/apikey.", type: "text", default: "", placeholder: "Paste your key", secret: true },
  { key: "profile", label: "Steam profile", hint: "The profile's 64-bit id, its custom URL name, or a link to it. Its Game details must be public.", type: "text", default: "", placeholder: "Such as 76561197960287930 or gabelogannewell" },
  auto_import_field("Steam"),
]);

export const gog_manifest = catalog("gog", "GOG", "GOG's store: search, details and box art for the games it sells.");

export const wikidata_manifest = catalog("wikidata", "Wikidata", "Links a game's ids in every other catalogue, so each is asked about the same game; also searched by title.");

export const itchio_manifest = catalog("itchio", "itch.io", "A game's page on itch.io, by its creator and slug, and the games your account has bought or claimed; itch.io has no search.", [
  { key: "api_key", label: "itch.io API key", hint: "Reads the games your account has bought or claimed. Make one at itch.io/user/settings/api-keys.", type: "text", default: "", placeholder: "Paste your key", secret: true },
  auto_import_field("itch.io"),
]);

export const epic_manifest = catalog("epic", "Epic Games Store", "Reads your Epic library the way the Legendary and Heroic launchers do; Epic publishes no API for it, so it may stop working.", [
  {
    key: "client_id",
    label: "Launcher client id",
    hint: "Epic lets only its own launcher read a library. Copy the launcher's client id from the Legendary launcher's source, legendary/api/egs.py.",
    type: "text",
    default: "",
    placeholder: "Paste the client id",
  },
  { key: "client_secret", label: "Launcher client secret", hint: "The secret beside that client id in the same file.", type: "text", default: "", placeholder: "Paste the client secret", secret: true },
  auto_import_field("the Epic Games Store"),
]);

export const steamgriddb_manifest = catalog("steamgriddb", "SteamGridDB", "Upright box art drawn by its users, for games the other catalogues have no cover for.", [
  key_field("A free key is under Preferences → API on steamgriddb.com."),
]);

// The stores whose libraries come in, each in its own dialog under Settings → Games → Stores.
export const game_store_manifests = [steam_manifest, itchio_manifest, epic_manifest];

// In the order their searches are joined, so the first to answer about a game wins where they differ.
export const game_catalog_manifests = [rawg_manifest, igdb_manifest, mobygames_manifest, giantbomb_manifest, thegamesdb_manifest, steam_manifest, gog_manifest, wikidata_manifest, itchio_manifest, steamgriddb_manifest];

// The games settings kept before each service was a plugin, and where each goes.
export const moved_game_keys: Record<string, SettingMove> = {
  "games.rawg_api_key": { plugin: rawg_manifest.id, field: "api_key" },
  "games.igdb_client_id": { plugin: igdb_manifest.id, field: "client_id" },
  "games.igdb_client_secret": { plugin: igdb_manifest.id, field: "client_secret" },
  "games.mobygames_api_key": { plugin: mobygames_manifest.id, field: "api_key" },
  "games.giantbomb_api_key": { plugin: giantbomb_manifest.id, field: "api_key" },
  "games.thegamesdb_api_key": { plugin: thegamesdb_manifest.id, field: "api_key" },
  "games.steamgriddb_api_key": { plugin: steamgriddb_manifest.id, field: "api_key" },
  "games.steam_api_key": { plugin: steam_manifest.id, field: "api_key" },
  "games.steam_id": { plugin: steam_manifest.id, field: "profile" },
  "games.steam_sync_hours": { plugin: steam_manifest.id, field: "auto_import", as: "switch" },
  "games.itchio_api_key": { plugin: itchio_manifest.id, field: "api_key" },
  "games.itchio_sync_hours": { plugin: itchio_manifest.id, field: "auto_import", as: "switch" },
  "games.epic_client_id": { plugin: epic_manifest.id, field: "client_id" },
  "games.epic_client_secret": { plugin: epic_manifest.id, field: "client_secret" },
  "games.epic_sync_hours": { plugin: epic_manifest.id, field: "auto_import", as: "switch" },
  "games.last_steam_sync": null,
  "games.last_steam_result": null,
  "games.last_itchio_sync": null,
  "games.last_itchio_result": null,
  "games.last_epic_sync": null,
  "games.last_epic_result": null,
};
