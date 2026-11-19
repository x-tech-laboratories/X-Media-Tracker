// Wikidata, open and keyless: searching video games, a game's details, and above all the ids other catalogues give it,
// so a game known to one catalogue, such as a Steam game, is found in the rest.

// ── Imports ──────────────────────────────────────────────────────────────────

import { empty_game, fetch_json, list_of, text_of, user_agent, type CatalogGame, type Fetch, type Json } from "./catalog.ts";
import type { GameIds } from "./model.ts";

// ── Requests ─────────────────────────────────────────────────────────────────

const api_base = "https://www.wikidata.org/w/api.php";
const results_shown = 20;
// wbgetentities takes at most this many ids at once.
const entities_per_request = 50;

const video_game = "Q7889";

// The properties holding each catalogue's id.
const id_properties: Record<Exclude<keyof GameIds, "wikidata_id">, string> = {
  rawg_id: "P9968",
  mobygames_id: "P11688",
  giantbomb_id: "P5247",
  steam_app_id: "P1733",
  igdb_id: "P5794",
  thegamesdb_id: "P7622",
  gog_id: "P2725",
  steamgriddb_id: "P12561",
};

// Wikidata writes a GOG id as game/<slug>, or movie/<slug> for a film, which is no game.
const gog_prefix = "game/";

// An id as Wikidata writes it, and as this app keeps it.
function wikidata_value(key: keyof typeof id_properties, value: string): string {
  return key === "gog_id" ? `${gog_prefix}${value}` : value;
}

function kept_value(key: keyof typeof id_properties, value: string): string {
  if (key !== "gog_id") return value;
  return value.startsWith(gog_prefix) ? value.slice(gog_prefix.length) : "";
}

const publication_date = "P577";
const platform = "P400";
const genre = "P136";
const developer = "P178";
const publisher = "P123";

// A time's precision: 11 is a day, 10 a month, 9 a year.
const day_precision = 11;

export interface Wikidata {
  search: (query: string) => Promise<CatalogGame[]>;
  game: (item: string) => Promise<CatalogGame>;
  // The item that has any of the ids given, or "" when none does.
  find: (ids: Partial<GameIds>) => Promise<string>;
}

type Claims = Record<string, Json[]>;

function claims_of(entity: Json): Claims {
  return (entity.claims ?? {}) as Claims;
}

// The values of a property's statements, best rank first and deprecated ones left out.
function values_of(claims: Claims, property: string): unknown[] {
  const statements = list_of(claims[property]).filter((each) => each.rank !== "deprecated");
  const ordered = [...statements.filter((each) => each.rank === "preferred"), ...statements.filter((each) => each.rank !== "preferred")];
  return ordered.map((each) => ((each.mainsnak as Json | undefined)?.datavalue as Json | undefined)?.value).filter((value) => value !== undefined);
}

function item_ids(claims: Claims, property: string): string[] {
  return values_of(claims, property)
    .map((value) => text_of((value as Json | null)?.id))
    .filter(Boolean);
}

// The earliest publication date, as a day when Wikidata knows the day, and its year.
function first_release(claims: Claims): { year: string; release_date: string } {
  const times = values_of(claims, publication_date)
    .map((value) => value as Json)
    .map((value) => ({ time: text_of(value.time).replace(/^\+/, ""), precision: Number(value.precision) }))
    .filter((each) => /^\d{4}-/.test(each.time))
    .sort((first, second) => first.time.localeCompare(second.time));
  const earliest = times[0];
  if (!earliest) return { year: "", release_date: "" };
  return { year: earliest.time.slice(0, 4), release_date: earliest.precision >= day_precision ? earliest.time.slice(0, 10) : "" };
}

// The English name, else the one for every language, which Wikidata keeps for names that need no translation.
function label_of(entity: Json): string {
  const labels = (entity.labels ?? {}) as Record<string, Json>;
  return text_of(labels.en?.value) || text_of(labels.mul?.value) || text_of(Object.values(labels)[0]?.value);
}

function game_of(id: string, entity: Json, names: Map<string, string>): CatalogGame {
  const claims = claims_of(entity);
  const named = (property: string) => [...new Set(item_ids(claims, property).map((each) => names.get(each) ?? "").filter(Boolean))].join(", ");
  const descriptions = (entity.descriptions ?? {}) as Record<string, Json>;
  return {
    ...empty_game("wikidata"),
    wikidata_id: id,
    ...(Object.fromEntries(
      (Object.entries(id_properties) as [keyof typeof id_properties, string][]).map(([key, property]) => [
        key,
        values_of(claims, property)
          .map((value) => kept_value(key, text_of(value)))
          .find(Boolean) ?? "",
      ]),
    ) as Record<keyof typeof id_properties, string>),
    title: label_of(entity),
    ...first_release(claims),
    overview: text_of(descriptions.en?.value),
    platforms: named(platform),
    genres: named(genre),
    developers: named(developer),
    publishers: named(publisher),
  };
}

// Wikimedia asks for one request at a time, so each waits for the one before, shared by every client.
let queue: Promise<unknown> = Promise.resolve();

function in_turn<Result>(work: () => Promise<Result>): Promise<Result> {
  const next = queue.then(work, work);
  queue = next.catch(() => undefined);
  return next;
}

const retries = 3;
const longest_wait_in_milliseconds = 30_000;

// Told to slow down, a request waits as long as Wikimedia says, up to half a minute, and tries again.
function patient(fetcher: Fetch): Fetch {
  return async (input, init) => {
    for (let attempt = 0; ; attempt++) {
      const response = await fetcher(input, init);
      if (response.status !== 429 || attempt >= retries) return response;
      const seconds = Number(response.headers.get("retry-after"));
      await new Promise((resolve) => setTimeout(resolve, Math.min(longest_wait_in_milliseconds, (Number.isFinite(seconds) && seconds > 0 ? seconds : 5) * 1000)));
    }
  };
}

export function create_wikidata(fetcher: Fetch = fetch): Wikidata {
  const waiting = patient(fetcher);
  const get = (query: Record<string, string>) =>
    in_turn(() => fetch_json(waiting, "Wikidata", `${api_base}?${new URLSearchParams({ ...query, format: "json", origin: "*" }).toString()}`, { headers: { "User-Agent": user_agent } }));

  async function entities(ids: string[], props: string): Promise<Record<string, Json>> {
    const found: Record<string, Json> = {};
    for (let start = 0; start < ids.length; start += entities_per_request) {
      const json = await get({ action: "wbgetentities", ids: ids.slice(start, start + entities_per_request).join("|"), props, languages: "en|mul" });
      Object.assign(found, (json.entities ?? {}) as Record<string, Json>);
    }
    return found;
  }

  // The items a CirrusSearch query finds, such as haswbstatement:P1733=620, most relevant first.
  async function search_items(query: string, limit: number): Promise<string[]> {
    const json = await get({ action: "query", list: "search", srsearch: query, srlimit: String(limit), srnamespace: "0" });
    return list_of((json.query as Json | undefined)?.search)
      .map((each) => text_of(each.title))
      .filter((title) => /^Q\d+$/.test(title));
  }

  async function games_of(ids: string[], with_names: boolean): Promise<CatalogGame[]> {
    if (ids.length === 0) return [];
    const found = await entities(ids, "labels|descriptions|claims");
    const names = new Map<string, string>();
    if (with_names) {
      const referenced = [...new Set(Object.values(found).flatMap((entity) => [platform, genre, developer, publisher].flatMap((property) => item_ids(claims_of(entity), property))))];
      for (const [id, entity] of Object.entries(await entities(referenced, "labels"))) names.set(id, label_of(entity));
    }
    return ids.filter((id) => found[id] && !found[id]!.missing).map((id) => game_of(id, found[id]!, names));
  }

  return {
    search: async (query) => {
      if (!query.trim()) return [];
      return games_of(await search_items(`haswbstatement:P31=${video_game} ${query}`, results_shown), false);
    },
    game: async (item) => {
      const [found] = await games_of([item], true);
      if (!found) throw new Error("Wikidata has no such game.");
      return found;
    },
    find: async (ids) => {
      for (const [key, property] of Object.entries(id_properties) as [keyof typeof id_properties, string][]) {
        const value = ids[key];
        if (!value) continue;
        const [item] = await search_items(`haswbstatement:"${property}=${wikidata_value(key, value).replace(/"/g, "")}"`, 1);
        if (item) return item;
      }
      return "";
    },
  };
}
