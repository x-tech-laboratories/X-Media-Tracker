// Searching games from the top bar: the library's own games and the catalogues' at once on a results page, each found
// game added with a button, or a pasted link added straight away.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useState } from "react";
import { Badge } from "@x-tech-laboratories/x-libs/web/react/badges";
import { MediaGrid, MediaTile } from "@x-tech-laboratories/x-libs/web/react/media";
import { SearchBox } from "@x-tech-laboratories/x-libs/web/react/controls";
import { PageHeading, Section, Stack } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Empty, Failure, Loaded, Skeleton, use_resource } from "@x-tech-laboratories/x-libs/web/react/states";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";

import { calls, use_data } from "../api.ts";
import { catalog_labels } from "../../shared/games/catalog.ts";
import { filter_games, game_links, game_status_labels, no_game_filters, parse_game_link, type GameSource } from "../../shared/games/model.ts";
import type { GameSearchResult } from "../../shared/games/store.ts";
import { game_href, game_search_href, report_added } from "./actions.tsx";

// ── Top bar ──────────────────────────────────────────────────────────────────

// Enter opens the results page; a pasted link is added at once instead.
export function GameSearchBar() {
  const [query, set_query] = useState("");
  const add_link = async (link: string) => {
    try {
      report_added(await calls().add_game_from_link(link));
      set_query("");
    } catch (error) {
      toast((error as Error).message, { tone: "bad" });
    }
  };
  return (
    <SearchBox
      label="Search your games and the catalogues, or paste a link"
      value={query}
      submit_label={parse_game_link(query) ? "Add" : "Search"}
      on_input={set_query}
      on_submit={(text) => {
        if (!text.trim()) return;
        if (parse_game_link(text)) void add_link(text);
        else window.location.hash = game_search_href(text.trim());
      }}
    />
  );
}

// ── Results ──────────────────────────────────────────────────────────────────

function LibraryMatches({ query }: { query: string }) {
  const games = use_data((api) => api.list_games());
  return (
    <Section title="In your library">
      <Loaded resource={games}>
        {(loaded) => {
          const found = filter_games(loaded.games, { ...no_game_filters, kind: "all", search: query });
          if (found.length === 0) return <Empty title={`Nothing in your library matches “${query}”.`} />;
          return (
            <MediaGrid label="In your library">
              {found.map((game) => (
                <MediaTile key={game.id} title={game.title} href={game_href(game.id)} image={game.cover_url} lines={[game.year, game_status_labels[game.status]].filter(Boolean)} />
              ))}
            </MediaGrid>
          );
        }}
      </Loaded>
    </Section>
  );
}

// The catalogue to add a result from: the one whose id names it best.
function source_of(result: GameSearchResult): [GameSource, string] {
  if (result.rawg_id) return ["rawg", result.rawg_id];
  if (result.mobygames_id) return ["mobygames", result.mobygames_id];
  if (result.giantbomb_id) return ["giantbomb", result.giantbomb_id];
  if (result.wikidata_id) return ["wikidata", result.wikidata_id];
  return ["steam", result.steam_app_id];
}

function result_key(result: GameSearchResult): string {
  return source_of(result).join(":");
}

function CatalogMatches({ query }: { query: string }) {
  const search = use_resource(() => calls().search_games(query), [query]);
  const [added, set_added] = useState<Record<string, string>>({});
  const [adding, set_adding] = useState<string | null>(null);

  const add = async (result: GameSearchResult) => {
    const key = result_key(result);
    set_adding(key);
    try {
      const done = await calls().add_game(...source_of(result));
      report_added(done);
      set_added({ ...added, [key]: done.id });
    } catch (error) {
      toast((error as Error).message, { tone: "bad" });
    } finally {
      set_adding(null);
    }
  };

  return (
    <Section title="From the catalogues">
      {search.status === "loading" && <Skeleton lines={4} />}
      {search.status === "failed" && <Failure error={search.error} retry={() => void search.reload()} />}
      {search.data && search.data.failures.length > 0 && <p className="muted">Left out: {search.data.failures.join("; ")}</p>}
      {search.data &&
        (search.data.results.length === 0 ? (
          <Empty title={`No catalogue has anything for “${query}”.`} />
        ) : (
          <MediaGrid label="From the catalogues">
            {search.data.results.map((result) => {
              const key = result_key(result);
              const tracked_id = result.tracked_id || added[key];
              return (
                <MediaTile
                  key={key}
                  title={result.title}
                  href={tracked_id ? game_href(tracked_id) : (game_links(result)[0]?.href ?? "#/games")}
                  image={result.cover_url}
                  lines={[[result.year, result.platforms].filter(Boolean).join(" · "), result.sources.map((source) => catalog_labels[source]).join(", ")]}
                  actions={
                    tracked_id ? (
                      <Badge tone="good">✓ In library</Badge>
                    ) : (
                      <button type="button" disabled={adding !== null} onClick={() => void add(result)}>
                        {adding === key ? "Adding…" : "Add"}
                      </button>
                    )
                  }
                />
              );
            })}
          </MediaGrid>
        ))}
    </Section>
  );
}

export function GameSearchView({ query }: { query: string }) {
  return (
    <div className="games-page">
      <Stack>
        <PageHeading title="Search" subtitle={`Results for “${query}” in your games and the catalogues.`} />
        <LibraryMatches query={query} />
        <CatalogMatches query={query} />
      </Stack>
    </div>
  );
}
