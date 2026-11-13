// Adding titles: a TMDB search for movies, shows or both, or a pasted TMDB or IMDb link added straight away.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useState } from "react";
import { Badge } from "@x-tech-laboratories/x-libs/web/react/badges";
import { MediaGrid, MediaTile } from "@x-tech-laboratories/x-libs/web/react/media";
import { SearchBox, Segmented } from "@x-tech-laboratories/x-libs/web/react/controls";
import { PageHeading, Toolbar } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Empty, Failure, Skeleton } from "@x-tech-laboratories/x-libs/web/react/states";
import { use_pref } from "@x-tech-laboratories/x-libs/web/react/prefs";
import { one_of } from "@x-tech-laboratories/x-libs/web/prefs";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";

import { calls, use_settings } from "../api.ts";
import { image_url, parse_media_link, type MediaType } from "../../shared/library/model.ts";
import type { Added, SearchResult } from "../../shared/library/store.ts";

// ── Search ───────────────────────────────────────────────────────────────────

type Scope = MediaType | "all";

type Results = { state: "idle" } | { state: "searching" } | { state: "found"; query: string; results: SearchResult[] } | { state: "failed"; error: unknown };

function href_of(id: string): string {
  return `#/library/title/${encodeURIComponent(id)}`;
}

function report_added(added: Added): void {
  toast(added.existed ? `${added.name} was already tracked; its details are refreshed.` : `Added ${added.name}.`, { tone: "good", link: { href: href_of(added.id), text: "Open" } });
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function AddTab() {
  const settings = use_settings();
  const [query, set_query] = useState("");
  const [scope, set_scope] = use_pref<Scope>("x-media-tracker-add-scope", "all", one_of("all", "movie", "show"));
  const [results, set_results] = useState<Results>({ state: "idle" });
  const [adding, set_adding] = useState<string | null>(null);
  const poster_size = String(settings.data?.["library.poster_size"] ?? "w342");
  const is_link = parse_media_link(query) !== null;

  const search = async (text: string, in_scope: Scope) => {
    if (!text.trim()) return set_results({ state: "idle" });
    set_results({ state: "searching" });
    try {
      set_results({ state: "found", query: text, results: await calls().search_tmdb(text, in_scope) });
    } catch (error) {
      set_results({ state: "failed", error });
    }
  };

  const add_link = async (link: string) => {
    set_adding(link);
    try {
      report_added(await calls().add_title_from_link(link));
      set_query("");
    } catch (error) {
      toast((error as Error).message, { tone: "bad" });
    } finally {
      set_adding(null);
    }
  };

  const add = async (result: SearchResult) => {
    set_adding(result.tmdb_id);
    try {
      const added = await calls().add_title(result.media_type, result.tmdb_id);
      report_added(added);
      if (results.state === "found") set_results({ ...results, results: results.results.map((each) => (each === result ? { ...each, tracked_id: added.id } : each)) });
    } catch (error) {
      toast((error as Error).message, { tone: "bad" });
    } finally {
      set_adding(null);
    }
  };

  return (
    <div className="add-page">
      <PageHeading title="Add" subtitle="Search TMDB, or paste a TMDB or IMDb link to add it at once." />
      <Toolbar>
        <SearchBox
          label="Search TMDB or paste a link"
          value={query}
          auto_focus
          submit_label={is_link ? "Add" : "Search"}
          on_input={set_query}
          on_submit={(text) => void (parse_media_link(text) ? add_link(text) : search(text, scope))}
        />
        <Segmented
          label="Search for"
          choices={[
            { value: "all", label: "All" },
            { value: "movie", label: "Movies" },
            { value: "show", label: "TV" },
          ]}
          value={scope}
          on_change={(next) => {
            set_scope(next);
            if (results.state === "found") void search(results.query, next);
          }}
        />
      </Toolbar>
      {results.state === "searching" && <Skeleton lines={4} />}
      {results.state === "failed" && <Failure error={results.error} retry={() => void search(query, scope)} />}
      {results.state === "found" &&
        (results.results.length === 0 ? (
          <Empty title={`TMDB has nothing for “${results.query}”.`} />
        ) : (
          <MediaGrid label="Results">
            {results.results.map((result) => (
              <MediaTile
                key={`${result.media_type}:${result.tmdb_id}`}
                title={result.name}
                href={result.tracked_id ? href_of(result.tracked_id) : `https://www.themoviedb.org/${result.media_type === "show" ? "tv" : "movie"}/${result.tmdb_id}`}
                image={image_url(result.poster_path, poster_size)}
                lines={[[result.year, result.media_type === "show" ? "TV" : "Movie"].filter(Boolean).join(" · "), result.overview]}
                actions={
                  result.tracked_id ? (
                    <Badge tone="good">✓ Added</Badge>
                  ) : (
                    <button type="button" disabled={adding !== null} onClick={() => void add(result)}>
                      {adding === result.tmdb_id ? "Adding…" : "Add"}
                    </button>
                  )
                }
              />
            ))}
          </MediaGrid>
        ))}
    </div>
  );
}
