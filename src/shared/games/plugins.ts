// The game catalogues as bundled plugins, each providing its catalogue to the games store with the key from its own
// settings; a catalogue whose key is not set is still provided, saying so, so search can tell the user.

// ── Imports ──────────────────────────────────────────────────────────────────

import { define_plugin, type PluginManifest, type SettingValues } from "@x-tech-laboratories/x-libs/plugins";

import type { MediaPlugin, MediaPluginApi } from "../plugins/host.ts";
import { same_game, type GameCatalog } from "./catalog.ts";
import { create_giantbomb } from "./giantbomb.ts";
import { create_gog } from "./gog.ts";
import { create_igdb } from "./igdb.ts";
import { create_itchio } from "./itchio.ts";
import {
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
import { create_wikidata } from "./wikidata.ts";

// ── Helpers ──────────────────────────────────────────────────────────────────

function setting(settings: SettingValues, key: string): string {
  return String(settings[key] ?? "").trim();
}

function catalog_plugin(manifest: PluginManifest, catalog_of: (settings: SettingValues) => GameCatalog): MediaPlugin {
  return define_plugin<MediaPluginApi>({
    ...manifest,
    start: (context) => {
      const catalog = catalog_of(context.settings());
      context.provide("game_catalog", catalog.source, catalog);
    },
  });
}

// A catalogue reached with a key, which answers nothing until the key is set.
function keyed<Client extends { game: GameCatalog["game"]; search: NonNullable<GameCatalog["search"]> }>(source: GameCatalog["source"], key: string, client_of: (key: string) => Client): GameCatalog {
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

export const steam_plugin = catalog_plugin(steam_manifest, () => {
  const steam = create_steam();
  return { source: "steam", missing: "", stage: "details", game: steam.game, search: steam.search };
});

export const gog_plugin = catalog_plugin(gog_manifest, () => {
  const gog = create_gog();
  return { source: "gog", missing: "", stage: "details", game: gog.game, search: gog.search };
});

export const wikidata_plugin = catalog_plugin(wikidata_manifest, () => {
  const wikidata = create_wikidata();
  return { source: "wikidata", missing: "", stage: "ids", game: wikidata.game, search: wikidata.search, find: (ids) => wikidata.find(ids) };
});

export const itchio_plugin = catalog_plugin(itchio_manifest, () => ({ source: "itchio", missing: "", stage: "details", game: create_itchio().game }));

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

// In the order their searches are joined.
export const game_catalog_plugins: MediaPlugin[] = [rawg_plugin, igdb_plugin, mobygames_plugin, giantbomb_plugin, thegamesdb_plugin, steam_plugin, gog_plugin, wikidata_plugin, itchio_plugin, steamgriddb_plugin];
