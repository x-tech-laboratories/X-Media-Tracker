// The game catalogues and stores as bundled plugins: each catalogue provides itself to the games store with the key from
// its own settings, still provided while that key is missing so search can say so; Steam, itch.io and the Epic Games
// Store provide importers for the sources' schedule.

// ── Imports ──────────────────────────────────────────────────────────────────

import { define_plugin, type PluginManifest, type SettingValues } from "@x-tech-laboratories/x-libs/plugins";

import type { MediaPlugin, MediaPluginApi } from "../plugins/host.ts";
import { same_game, type GameCatalog } from "./catalog.ts";
import { create_giantbomb } from "./giantbomb.ts";
import { create_gog } from "./gog.ts";
import { create_igdb } from "./igdb.ts";
import { create_itchio } from "./itchio.ts";
import {
  epic_manifest,
  giantbomb_manifest,
  gog_manifest,
  igdb_manifest,
  itchio_manifest,
  mobygames_manifest,
  rawg_manifest,
  steam_manifest,
  steamgriddb_manifest,
  thegamesdb_manifest,
  wikidata_manifest,
} from "./manifests.ts";
import { create_mobygames } from "./mobygames.ts";
import { create_rawg } from "./rawg.ts";
import { create_steam } from "./steam.ts";
import { create_steamgriddb } from "./steamgriddb.ts";
import { create_thegamesdb } from "./thegamesdb.ts";
import { import_epic_library, import_itchio_library, import_steam, is_epic_ready, is_itchio_ready, is_steam_ready } from "./store.ts";
import { create_wikidata } from "./wikidata.ts";

// ── Helpers ──────────────────────────────────────────────────────────────────

function setting(settings: SettingValues, key: string): string {
  return String(settings[key] ?? "").trim();
}

// A catalogue as the store asks it, named as its plugin is.
type CatalogOf = (settings: SettingValues) => Omit<GameCatalog, "label">;

function catalog_plugin(manifest: PluginManifest, catalog_of: CatalogOf): MediaPlugin {
  return define_plugin<MediaPluginApi>({
    ...manifest,
    start: (context) => {
      const catalog = { label: manifest.name, ...catalog_of(context.settings()) };
      context.provide("game_catalog", catalog.source, catalog);
    },
  });
}

// A catalogue reached with a key, which answers nothing until the key is set.
function keyed<Client extends { game: GameCatalog["game"]; search: NonNullable<GameCatalog["search"]> }>(source: GameCatalog["source"], key: string, client_of: (key: string) => Client): ReturnType<CatalogOf> {
  const refuse = () => Promise.reject(new Error("no key set"));
  if (!key) return { source, missing: "no key set", stage: "details", game: refuse, search: refuse };
  const client = client_of(key);
  return { source, missing: "", stage: "details", game: client.game, search: client.search };
}

// ── Plugins ──────────────────────────────────────────────────────────────────

export const rawg_plugin = catalog_plugin(rawg_manifest, (settings) => keyed("rawg", setting(settings, "api_key"), create_rawg));

export const igdb_plugin = catalog_plugin(igdb_manifest, (settings) => {
  const id = setting(settings, "client_id");
  const secret = setting(settings, "client_secret");
  return keyed("igdb", id && secret ? "set" : "", () => create_igdb(id, secret));
});

export const mobygames_plugin = catalog_plugin(mobygames_manifest, (settings) => keyed("mobygames", setting(settings, "api_key"), create_mobygames));

export const giantbomb_plugin = catalog_plugin(giantbomb_manifest, (settings) => keyed("giantbomb", setting(settings, "api_key"), create_giantbomb));

export const thegamesdb_plugin = catalog_plugin(thegamesdb_manifest, (settings) => keyed("thegamesdb", setting(settings, "api_key"), create_thegamesdb));

// Steam is a catalogue for every game it sells and, with a key and profile, the source of the library and wishlist.
export const steam_plugin = define_plugin<MediaPluginApi>({
  ...steam_manifest,
  start: (context) => {
    const steam = create_steam();
    context.provide("game_catalog", "steam", { source: "steam", label: steam_manifest.name, missing: "", stage: "details", game: steam.game, search: steam.search });
    context.provide("importer", "steam", { label: "Steam", is_ready: is_steam_ready, run: import_steam, imports_automatically: () => context.settings().auto_import === true });
  },
});

export const gog_plugin = catalog_plugin(gog_manifest, () => {
  const gog = create_gog();
  return { source: "gog", missing: "", stage: "details", game: gog.game, search: gog.search };
});

export const wikidata_plugin = catalog_plugin(wikidata_manifest, () => {
  const wikidata = create_wikidata();
  return { source: "wikidata", missing: "", stage: "ids", game: wikidata.game, search: wikidata.search, find: (ids) => wikidata.find(ids) };
});

// itch.io is a catalogue by a game's page and, with a key, the source of the games the account owns.
export const itchio_plugin = define_plugin<MediaPluginApi>({
  ...itchio_manifest,
  start: (context) => {
    context.provide("game_catalog", "itchio", { source: "itchio", label: itchio_manifest.name, missing: "", stage: "details", game: create_itchio().game });
    context.provide("importer", "itchio", { label: "itch.io", is_ready: is_itchio_ready, run: import_itchio_library, imports_automatically: () => context.settings().auto_import === true });
  },
});

export const epic_plugin = define_plugin<MediaPluginApi>({
  ...epic_manifest,
  start: (context) =>
    context.provide("importer", "epic", { label: "Epic Games Store", is_ready: is_epic_ready, run: import_epic_library, imports_automatically: () => context.settings().auto_import === true }),
});

// SteamGridDB finds a game by its Steam app, else by the same title and year, and is asked last, for art.
export const steamgriddb_plugin = catalog_plugin(steamgriddb_manifest, (settings) => {
  const key = setting(settings, "api_key");
  if (!key) return { source: "steamgriddb", missing: "no key set", stage: "art", game: () => Promise.reject(new Error("no key set")) };
  const steamgriddb = create_steamgriddb(key);
  return {
    source: "steamgriddb",
    missing: "",
    stage: "art",
    game: steamgriddb.game,
    find: async (ids, known) => {
      const by_steam = ids.steam_app_id ? await steamgriddb.by_steam(ids.steam_app_id).catch(() => "") : "";
      if (by_steam || !known.title) return by_steam;
      const found = await steamgriddb.search(known.title).catch(() => []);
      return found.find((each) => same_game(each, { ...known, steamgriddb_id: "" }))?.steamgriddb_id ?? "";
    },
  };
});

// The stores whose libraries come in, for the sources' schedule.
export const game_store_plugins: MediaPlugin[] = [steam_plugin, itchio_plugin, epic_plugin];

// In the order their searches are joined.
export const game_catalog_plugins: MediaPlugin[] = [rawg_plugin, igdb_plugin, mobygames_plugin, giantbomb_plugin, thegamesdb_plugin, steam_plugin, gog_plugin, wikidata_plugin, itchio_plugin, steamgriddb_plugin];
