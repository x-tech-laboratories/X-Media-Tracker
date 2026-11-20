// The bundled game catalogue plugins as the plugin host knows them: their names, versions and settings, with each
// catalogue's key kept secret. The store and the page each start their own side of a plugin from the same manifest.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { PluginManifest, SettingField } from "@x-tech-laboratories/x-libs/plugins";

import { app_info } from "../plugins/app.ts";

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

export const steam_manifest = catalog("steam", "Steam", "Steam's store: search, details and upright art for the games it sells.");

export const gog_manifest = catalog("gog", "GOG", "GOG's store: search, details and box art for the games it sells.");

export const wikidata_manifest = catalog("wikidata", "Wikidata", "Links a game's ids in every other catalogue, so each is asked about the same game; also searched by title.");

export const itchio_manifest = catalog("itchio", "itch.io", "A game's page on itch.io, by its creator and slug; itch.io has no search.");

export const steamgriddb_manifest = catalog("steamgriddb", "SteamGridDB", "Upright box art drawn by its users, for games the other catalogues have no cover for.", [
  key_field("A free key is under Preferences → API on steamgriddb.com."),
]);

// In the order their searches are joined, so the first to answer about a game wins where they differ.
export const game_catalog_manifests = [rawg_manifest, igdb_manifest, mobygames_manifest, giantbomb_manifest, thegamesdb_manifest, steam_manifest, gog_manifest, wikidata_manifest, itchio_manifest, steamgriddb_manifest];

// The games settings each catalogue's key was kept in before it was a plugin, and the plugin field it moves to.
export const moved_game_keys: Record<string, { plugin: string; field: string }> = {
  "games.rawg_api_key": { plugin: rawg_manifest.id, field: "api_key" },
  "games.igdb_client_id": { plugin: igdb_manifest.id, field: "client_id" },
  "games.igdb_client_secret": { plugin: igdb_manifest.id, field: "client_secret" },
  "games.mobygames_api_key": { plugin: mobygames_manifest.id, field: "api_key" },
  "games.giantbomb_api_key": { plugin: giantbomb_manifest.id, field: "api_key" },
  "games.thegamesdb_api_key": { plugin: thegamesdb_manifest.id, field: "api_key" },
  "games.steamgriddb_api_key": { plugin: steamgriddb_manifest.id, field: "api_key" },
};
