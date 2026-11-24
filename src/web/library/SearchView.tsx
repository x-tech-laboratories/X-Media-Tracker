// Searching from the top bar: the library's own titles and the catalogues' at once on a results page, each found title
// added with a button, or a pasted TMDB or IMDb link added straight away.

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
import type { Added, TitleSearchResult } from "../../shared/library/store.ts";

// ── Links ────────────────────────────────────────────────────────────────────

type Scope = MediaType | "all";

function href_of(id: string): string {
  return `#/movies/title/${encodeURIComponent(id)}`;
}

export function search_href(query: string): string {
  return `#/movies/search/${encodeURIComponent(query)}`;
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
      label="Search your library and the catalogues, or paste a link"
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

// A result's own key, by its strongest id.
function result_key(result: TitleSearchResult): string {
  const [other] = Object.entries(result.other_ids);
  return `${result.media_type}:${result.tmdb_id ? `tmdb:${result.tmdb_id}` : result.imdb_id ? `imdb:${result.imdb_id}` : other ? other.join(":") : result.name}`;
}

// Where a result not yet tracked links to: its TMDB page, else nowhere new.
function outside_href(result: TitleSearchResult): string {
  return result.tmdb_id ? `https://www.themoviedb.org/${result.media_type === "show" ? "tv" : "movie"}/${result.tmdb_id}` : "#/movies";
}

function CatalogMatches({ query, poster_size }: { query: string; poster_size: string }) {
  const [scope, set_scope] = use_pref<Scope>("x-media-tracker-add-scope", "all", one_of("all", "movie", "show"));
  const search = use_resource(() => calls().search_titles(query, scope), [query, scope]);
  const [added, set_added] = useState<Record<string, string>>({});
  const [adding, set_adding] = useState<string | null>(null);

  const add = async (result: TitleSearchResult) => {
    const key = result_key(result);
    set_adding(key);
    try {
      const done = await calls().add_title_by_ids(result.media_type, { tmdb_id: result.tmdb_id, imdb_id: result.imdb_id, other_ids: result.other_ids });
      report_added(done);
      set_added({ ...added, [key]: done.id });
    } catch (error) {
      toast((error as Error).message, { tone: "bad" });
    } finally {
      set_adding(null);
    }
  };

  const scope_choice = (
    <Segmented
      label="Search the catalogues for"
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
    <Section title="From the catalogues" tools={scope_choice}>
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
              const from = result.sources.map((source) => search.data!.labels[source] ?? source).join(", ");
              return (
                <MediaTile
                  key={key}
                  title={result.name}
                  href={tracked_id ? href_of(tracked_id) : outside_href(result)}
                  image={image_url(result.poster_path, poster_size)}
                  lines={[type_line(result.year, result.media_type), from, result.overview]}
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

export function SearchView({ query }: { query: string }) {
  const settings = use_settings();
  const poster_size = String(settings.data?.["library.poster_size"] ?? "w342");
  return (
    <div className="search-page">
      <Stack>
        <PageHeading title="Search" subtitle={`Results for “${query}” in your library and the catalogues.`} />
        <LibraryMatches query={query} poster_size={poster_size} />
        <CatalogMatches query={query} poster_size={poster_size} />
      </Stack>
    </div>
  );
}
