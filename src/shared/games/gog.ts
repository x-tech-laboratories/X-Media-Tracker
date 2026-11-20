// GOG, open and keyless through the store's own catalogue and product answers: searching games and a game's details
// with its box art. A game's GOG id here is its store page's slug, such as the_witcher_3_wild_hunt, as Wikidata and
// GOG's links name it; GOG's answers are not a published API, so they may change.

// ── Imports ──────────────────────────────────────────────────────────────────

import { empty_game, fetch_json, fetch_text, list_of, names_of, plain_text, text_of, user_agent, type CatalogGame, type Fetch, type Json } from "./catalog.ts";
import { release_day } from "./model.ts";

// ── Requests ─────────────────────────────────────────────────────────────────

const store_base = "https://www.gog.com/en/game";
const catalog_base = "https://catalog.gog.com/v1/catalog";
const api_base = "https://api.gog.com";
const results_shown = 20;
const region = { locale: "en-US", countryCode: "US", currencyCode: "USD" };

const system_names: Record<string, string> = { windows: "Windows", osx: "macOS", mac: "macOS", linux: "Linux" };

export interface Gog {
  search: (query: string) => Promise<CatalogGame[]>;
  game: (slug: string) => Promise<CatalogGame>;
}

function systems(names: string[]): string {
  return [...new Set(names.map((name) => system_names[name.toLowerCase()] ?? "").filter(Boolean))].join(", ");
}

// GOG writes days as 2015.05.19 in its catalogue and as 2015-05-19T00:00:00+02:00 in its products.
function day_of(value: unknown): string {
  return release_day(text_of(value).slice(0, 10).replace(/\./g, "-"));
}

// The product number in an api.gog.com link, such as https://api.gog.com/v2/games/1207664663.
function product_in(link: unknown): string {
  return /\/games\/(\d+)/.exec(text_of((link as Json | undefined)?.href))?.[1] ?? "";
}

function listed_game(json: Json): CatalogGame {
  const release_date = day_of(json.releaseDate);
  const cover = text_of(json.coverVertical);
  return {
    ...empty_game("gog"),
    gog_id: text_of(json.slug),
    title: text_of(json.title),
    year: release_date.slice(0, 4),
    release_date,
    cover_url: cover,
    cover_source: cover ? "gog" : "",
    banner_url: text_of(json.coverHorizontal),
    genres: names_of(json.genres),
    platforms: systems((Array.isArray(json.operatingSystems) ? json.operatingSystems : []).map(text_of)),
    developers: (Array.isArray(json.developers) ? json.developers : []).map(text_of).filter(Boolean).join(", "),
    publishers: (Array.isArray(json.publishers) ? json.publishers : []).map(text_of).filter(Boolean).join(", "),
  };
}

export function create_gog(fetcher: Fetch = fetch): Gog {
  const headers = { "User-Agent": user_agent };

  // The product number a store page shows, which GOG's product answers are asked by.
  async function product_of(slug: string): Promise<string> {
    const page = await fetch_text(fetcher, "GOG", `${store_base}/${encodeURIComponent(slug)}`, { headers });
    const product = /card-product="(\d+)"/.exec(page)?.[1];
    if (!product) throw new Error("GOG has no such game.");
    return product;
  }

  // A DLC's game, by its slug and title.
  async function base_of(product: string): Promise<{ base_game: string; base_game_title: string }> {
    const [found] = list_of((await fetch_json(fetcher, "GOG", `${api_base}/products?${new URLSearchParams({ ids: product }).toString()}`, { headers })) as unknown);
    const slug = text_of(found?.slug);
    return slug ? { base_game: `gog:${slug}`, base_game_title: text_of(found?.title) } : { base_game: "", base_game_title: "" };
  }

  return {
    search: async (query) => {
      if (!query.trim()) return [];
      const search = new URLSearchParams({ query: `like:${query.trim()}`, limit: String(results_shown), order: "desc:score", productType: "in:game,pack,dlc", ...region });
      const json = await fetch_json(fetcher, "GOG", `${catalog_base}?${search.toString()}`, { headers });
      return list_of(json.products).map(listed_game);
    },
    game: async (slug) => {
      const product = await product_of(slug);
      const json = await fetch_json(fetcher, "GOG", `${api_base}/v2/games/${product}?${new URLSearchParams({ locale: region.locale }).toString()}`, { headers });
      const embedded = (json._embedded ?? {}) as Json;
      const links = (json._links ?? {}) as Json;
      const details = (embedded.product ?? {}) as Json;
      const release_date = day_of(details.globalReleaseDate) || day_of(details.gogReleaseDate);
      const cover = text_of((links.boxArtImage as Json | undefined)?.href);
      const required = list_of(links.requiresGames).map(product_in).find(Boolean) ?? "";
      const is_dlc = text_of(embedded.productType).toUpperCase() === "DLC" && !!required;
      return {
        ...empty_game("gog"),
        gog_id: slug,
        gog_product_id: product,
        title: text_of(details.title),
        year: release_date.slice(0, 4),
        release_date,
        overview: plain_text(text_of(json.description)),
        cover_url: cover,
        cover_source: cover ? "gog" : "",
        banner_url: text_of((links.galaxyBackgroundImage as Json | undefined)?.href),
        // The first level of GOG's tags are its genres.
        genres: names_of(list_of(embedded.tags).filter((tag) => tag.level === 1)),
        platforms: systems(list_of(embedded.supportedOperatingSystems).map((each) => text_of((each.operatingSystem as Json | undefined)?.name))),
        developers: names_of(embedded.developers),
        publishers: names_of(embedded.publishers),
        ...(is_dlc ? await base_of(required).catch(() => ({})) : {}),
      };
    },
  };
}
