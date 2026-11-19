// The Epic Games Store: the games an account owns, read through the launcher's sign-in and library service with the
// launcher's client id and secret from settings, as the Legendary and Heroic launchers do. Epic publishes no API for
// this, so it may change. A game's Epic id here is its catalogue item id, 32 letters and digits.

// ── Imports ──────────────────────────────────────────────────────────────────

import { fetch_json, list_of, text_of, type Fetch, type Json } from "./catalog.ts";

// ── Requests ─────────────────────────────────────────────────────────────────

const service = "The Epic Games Store";

const launcher_agent = "UELauncher/11.0.1-14907503+++Portal+Release-Live Windows/10.0.19041.1.256.64bit";

const oauth_address = "https://account-public-service-prod03.ol.epicgames.com/account/api/oauth/token";
const library_address = "https://library-service.live.use1a.on.epicgames.com/library/api/public/items";
const catalog_base = "https://catalog-public-service-prod06.ol.epicgames.com/catalog/api/shared/namespace";

// Unreal Engine's marketplace, whose items are assets, not games.
const unreal_namespace = "ue";
// Catalogue categories that mark an item as no game of its own.
const not_game_categories = new Set(["addons", "mods", "assets", "plugins", "projects", "digitalextras", "engines"]);
// Box art first, then the store's upright picture, then the wide one.
const cover_types = ["DieselGameBoxTall", "OfferImageTall", "DieselStoreFrontTall", "DieselGameBox", "OfferImageWide"];
// A guard against a library whose pages never end.
const most_pages = 200;

export interface EpicClient {
  id: string;
  secret: string;
}

export interface EpicSession {
  access_token: string;
  // Spent by its next use, which gives a new one.
  refresh_token: string;
  display_name: string;
}

export interface EpicItem {
  namespace: string;
  catalog_item_id: string;
}

export interface OwnedEpicGame {
  epic_id: string;
  title: string;
  cover_url: string;
  developers: string;
}

export interface Epic {
  sign_in: (code: string) => Promise<EpicSession>;
  refresh: (refresh_token: string) => Promise<EpicSession>;
  library: (access_token: string) => Promise<EpicItem[]>;
  // The item's game, or null when it is DLC, an add-on or an asset.
  game: (access_token: string, item: EpicItem) => Promise<OwnedEpicGame | null>;
}

// The page that signs in to Epic and then shows the one-time code to paste back.
export function epic_sign_in_link(client_id: string): string {
  return `https://www.epicgames.com/id/login?redirectUrl=${encodeURIComponent(`https://www.epicgames.com/id/api/redirect?clientId=${client_id}&responseType=code`)}`;
}

// The code alone, or the whole answer Epic's redirect page shows, such as {"authorizationCode":"…"}.
export function parse_epic_code(input: string): string {
  const text = input.trim();
  const code = /"authorizationCode"\s*:\s*"(\w+)"/.exec(text)?.[1] ?? text;
  return /^\w{16,}$/.test(code) ? code : "";
}

function session_of(json: Json): EpicSession {
  const access_token = text_of(json.access_token);
  const refresh_token = text_of(json.refresh_token);
  if (!access_token || !refresh_token) throw new Error(`${service} gave no sign-in.`);
  return { access_token, refresh_token, display_name: text_of(json.displayName) };
}

function cover_of(images: Json[]): string {
  for (const type of cover_types) {
    const url = text_of(images.find((image) => text_of(image.type) === type)?.url);
    if (url) return url;
  }
  return "";
}

function is_game(json: Json): boolean {
  if (json.mainGameItem) return false;
  return !list_of(json.categories).some((category) => not_game_categories.has(text_of(category.path)));
}

function is_unreachable(error: unknown): boolean {
  return (error as Error).message.endsWith("could not be reached.");
}

export function create_epic(client: EpicClient, fetcher: Fetch = fetch): Epic {
  const sign = async (form: Record<string, string>): Promise<EpicSession> => {
    const json = await fetch_json(fetcher, service, oauth_address, {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`${client.id}:${client.secret}`)}`, "User-Agent": launcher_agent },
      body: new URLSearchParams({ ...form, token_type: "eg1" }),
    });
    return session_of(json);
  };
  const bearer = (access_token: string) => ({ headers: { Authorization: `bearer ${access_token}`, "User-Agent": launcher_agent } });

  return {
    sign_in: async (code) => {
      try {
        return await sign({ grant_type: "authorization_code", code });
      } catch (error) {
        if (is_unreachable(error)) throw error;
        throw new Error(`${service} refused the code or the client; open the sign-in page again for a new code, since each works once and only for a few minutes.`);
      }
    },
    refresh: async (refresh_token) => {
      try {
        return await sign({ grant_type: "refresh_token", refresh_token });
      } catch (error) {
        if (is_unreachable(error)) throw error;
        throw new Error(`${service} sign-in has run out; sign in again in Settings → Games.`);
      }
    },
    // Pages are followed by their cursor; an item kept private to Epic, or from Unreal's marketplace, is left out.
    library: async (access_token) => {
      const items = new Map<string, EpicItem>();
      let cursor = "";
      for (let page = 0; page < most_pages; page++) {
        const search = new URLSearchParams({ includeMetadata: "true", ...(cursor ? { cursor } : {}) });
        const json = await fetch_json(fetcher, service, `${library_address}?${search.toString()}`, bearer(access_token));
        for (const record of list_of(json.records)) {
          const namespace = text_of(record.namespace);
          const catalog_item_id = text_of(record.catalogItemId);
          if (!namespace || !catalog_item_id || namespace === unreal_namespace || text_of(record.sandboxType) === "PRIVATE") continue;
          items.set(catalog_item_id, { namespace, catalog_item_id });
        }
        cursor = text_of(((json.responseMetadata ?? {}) as Json).nextCursor);
        if (!cursor) break;
      }
      return [...items.values()];
    },
    game: async (access_token, item) => {
      const search = new URLSearchParams({ id: item.catalog_item_id, includeDLCDetails: "true", includeMainGameDetails: "true", country: "US", locale: "en-US" });
      const address = `${catalog_base}/${encodeURIComponent(item.namespace)}/bulk/items?${search.toString()}`;
      const json = ((await fetch_json(fetcher, service, address, bearer(access_token)))[item.catalog_item_id] ?? null) as Json | null;
      if (!json || !is_game(json)) return null;
      return { epic_id: item.catalog_item_id, title: text_of(json.title), cover_url: cover_of(list_of(json.keyImages)), developers: text_of(json.developer) };
    },
  };
}
