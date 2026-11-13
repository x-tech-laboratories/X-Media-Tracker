// Searching from the top bar: the library's own titles and TMDB's at once on a results page, each TMDB result added
// with a button, or a pasted TMDB or IMDb link added straight away.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useState } from "react";
import { Badge } from "@x-tech-laboratories/x-libs/web/react/badges";
import { MediaGrid, MediaTile } from "@x-tech-laboratories/x-libs/web/react/media";
import { SearchBox, Segmented } from "@x-tech-laboratories/x-libs/web/react/controls";
import { PageHeading, Section, Stack } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Empty, Failure, Loaded, Skeleton, use_resource } from "@x-tech-laboratories/x-libs/web/react/states";
import { use_pref } from "@x-tech-laboratories/x-libs/web/react/prefs";
import { one_of } from "@x-tech-laboratories/x-libs/web/prefs";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";

import { calls, use_data, use_settings } from "../api.ts";
import { filter_titles, image_url, no_filters, parse_media_link, status_labels, type MediaType } from "../../shared/library/model.ts";
import type { Added, SearchResult } from "../../shared/library/store.ts";

// ── Links ────────────────────────────────────────────────────────────────────

type Scope = MediaType | "all";

function href_of(id: string): string {
  return `#/library/title/${encodeURIComponent(id)}`;
}

export function search_href(query: string): string {
  return `#/library/search/${encodeURIComponent(query)}`;
}

function report_added(added: Added): void {
  toast(added.existed ? `${added.name} was already tracked; its details are refreshed.` : `Added ${added.name}.`, { tone: "good", link: { href: href_of(added.id), text: "Open" } });
}

function type_line(year: string, media_type: MediaType): string {
  return [year, media_type === "show" ? "TV" : "Movie"].filter(Boolean).join(" · ");
}

// ── Top bar ──────────────────────────────────────────────────────────────────

// Enter opens the results page; a pasted link is added at once instead.
export function SearchBar() {
  const [query, set_query] = useState("");
  const add_link = async (link: string) => {
    try {
      report_added(await calls().add_title_from_link(link));
      set_query("");
    } catch (error) {
      toast((error as Error).message, { tone: "bad" });
    }
  };
  return (
    <SearchBox
      label="Search your library and TMDB, or paste a link"
      value={query}
      submit_label={parse_media_link(query) ? "Add" : "Search"}
      on_input={set_query}
      on_submit={(text) => {
        if (!text.trim()) return;
        if (parse_media_link(text)) void add_link(text);
        else window.location.hash = search_href(text.trim());
      }}
    />
  );
}

// ── Results ──────────────────────────────────────────────────────────────────

function LibraryMatches({ query, poster_size }: { query: string; poster_size: string }) {
  const library = use_data((api) => api.list_library());
  return (
    <Section title="In your library">
      <Loaded resource={library}>
        {(loaded) => {
          const found = filter_titles(loaded.titles, { ...no_filters, search: query }, loaded.collections);
          if (found.length === 0) return <Empty title={`Nothing in your library matches “${query}”.`} />;
          return (
            <MediaGrid label="In your library">
              {found.map((title) => (
                <MediaTile key={title.id} title={title.name} href={href_of(title.id)} image={image_url(title.poster_path, poster_size)} lines={[type_line(title.year, title.media_type), status_labels[title.status]]} />
              ))}
            </MediaGrid>
          );
        }}
      </Loaded>
    </Section>
  );
}

function TmdbMatches({ query, poster_size }: { query: string; poster_size: string }) {
  const [scope, set_scope] = use_pref<Scope>("x-media-tracker-add-scope", "all", one_of("all", "movie", "show"));
  const results = use_resource(() => calls().search_tmdb(query, scope), [query, scope]);
  const [added, set_added] = useState<Record<string, string>>({});
  const [adding, set_adding] = useState<string | null>(null);

  const add = async (result: SearchResult) => {
    set_adding(result.tmdb_id);
    try {
      const done = await calls().add_title(result.media_type, result.tmdb_id);
      report_added(done);
      set_added({ ...added, [`${result.media_type}:${result.tmdb_id}`]: done.id });
    } catch (error) {
      toast((error as Error).message, { tone: "bad" });
    } finally {
      set_adding(null);
    }
  };

  const scope_choice = (
    <Segmented
      label="Search TMDB for"
      choices={[
        { value: "all", label: "All" },
        { value: "movie", label: "Movies" },
        { value: "show", label: "TV" },
      ]}
      value={scope}
      on_change={set_scope}
    />
  );

  return (
    <Section title="From TMDB" tools={scope_choice}>
      {results.status === "loading" && <Skeleton lines={4} />}
      {results.status === "failed" && <Failure error={results.error} retry={() => void results.reload()} />}
      {results.data &&
        (results.data.length === 0 ? (
          <Empty title={`TMDB has nothing for “${query}”.`} />
        ) : (
          <MediaGrid label="From TMDB">
            {results.data.map((result) => {
              const tracked_id = result.tracked_id ?? added[`${result.media_type}:${result.tmdb_id}`];
              return (
                <MediaTile
                  key={`${result.media_type}:${result.tmdb_id}`}
                  title={result.name}
                  href={tracked_id ? href_of(tracked_id) : `https://www.themoviedb.org/${result.media_type === "show" ? "tv" : "movie"}/${result.tmdb_id}`}
                  image={image_url(result.poster_path, poster_size)}
                  lines={[type_line(result.year, result.media_type), result.overview]}
                  actions={
                    tracked_id ? (
                      <Badge tone="good">✓ In library</Badge>
                    ) : (
                      <button type="button" disabled={adding !== null} onClick={() => void add(result)}>
                        {adding === result.tmdb_id ? "Adding…" : "Add"}
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

export function SearchView({ query }: { query: string }) {
  const settings = use_settings();
  const poster_size = String(settings.data?.["library.poster_size"] ?? "w342");
  return (
    <div className="search-page">
      <Stack>
        <PageHeading title="Search" subtitle={`Results for “${query}” in your library and on TMDB.`} />
        <LibraryMatches query={query} poster_size={poster_size} />
        <TmdbMatches query={query} poster_size={poster_size} />
      </Stack>
    </div>
  );
}
