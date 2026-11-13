// The Library: every tracked title as a poster, narrowed by name, type, status, genre and each collection group, each
// choice showing how many titles it would leave, sorted and optionally grouped under its collections.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useState } from "react";
import { MediaGrid, MediaTile } from "@x-tech-laboratories/x-libs/web/react/media";
import { MenuButton } from "@x-tech-laboratories/x-libs/web/react/menu_button";
import { SearchBox, Segmented, Select } from "@x-tech-laboratories/x-libs/web/react/controls";
import { PageHeading, Section, Toolbar } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Empty, Loaded } from "@x-tech-laboratories/x-libs/web/react/states";
import { is_boolean, one_of } from "@x-tech-laboratories/x-libs/web/prefs";
import { use_pref } from "@x-tech-laboratories/x-libs/web/react/prefs";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";

import { calls, use_data, use_settings } from "../api.ts";
import {
  facet_counts,
  filter_titles,
  group_by_collection,
  image_url,
  list_genres,
  no_filters,
  sort_keys,
  sort_labels,
  sort_titles,
  status_labels,
  statuses,
  type Collection,
  type CollectionGroup,
  type LibraryFilters,
  type LibraryTitle,
  type SortKey,
} from "../../shared/library/model.ts";
import type { Library } from "../../shared/library/store.ts";
import { status_menu_items } from "./status.tsx";

// ── Remembered view ──────────────────────────────────────────────────────────

function is_filters(value: unknown): value is Omit<LibraryFilters, "search"> {
  const filters = value as Partial<LibraryFilters> | null;
  return !!filters && typeof filters.media_type === "string" && typeof filters.status === "string" && typeof filters.genre === "string" && typeof filters.groups === "object";
}

const { search: _search, ...remembered_defaults } = no_filters;

// ── Tiles ────────────────────────────────────────────────────────────────────

function progress_text(title: LibraryTitle): string {
  if (title.media_type !== "show") return title.rating ? `★ ${title.rating}` : "";
  return title.total_episodes ? `${title.watched_count}/${title.total_episodes}` : title.watched_count ? `${title.watched_count} watched` : "";
}

function TitleTile({ title, poster_size }: { title: LibraryTitle; poster_size: string }) {
  const remove = async () => {
    await calls().remove_title(title.id);
    toast(`Removed ${title.name}.`, { link: { href: "#/history", text: "History" } });
  };
  return (
    <MediaTile
      title={title.name}
      href={`#/library/title/${encodeURIComponent(title.id)}`}
      image={image_url(title.poster_path, poster_size)}
      corner={progress_text(title) || undefined}
      lines={[[title.year, title.media_type === "show" ? "TV" : "Movie"].filter(Boolean).join(" · "), status_labels[title.status]]}
      dimmed={title.status === "dropped"}
      actions={
        <MenuButton
          label={`${title.name} actions`}
          items={() => [...status_menu_items(title), { label: "Remove", danger: true, separator_before: true, run: () => void remove() }]}
        />
      }
    />
  );
}

function Tiles({ titles, poster_size, rows }: { titles: LibraryTitle[]; poster_size: string; rows: boolean }) {
  return (
    <MediaGrid label="Titles" rows={rows}>
      {titles.map((title) => (
        <TitleTile key={title.id} title={title} poster_size={poster_size} />
      ))}
    </MediaGrid>
  );
}

// ── Filters ──────────────────────────────────────────────────────────────────

function with_count(label: string, count: number | undefined): string {
  return `${label} (${count ?? 0})`;
}

// One select per collection group that has collections, then one for collections in no group.
function group_filters(collections: Collection[], groups: CollectionGroup[]): { id: string; name: string; collections: Collection[] }[] {
  const shown = [...groups.map((group) => ({ id: group.id, name: group.name })), { id: "", name: groups.length ? "Other collections" : "Collection" }];
  return shown.map((group) => ({ ...group, collections: collections.filter((collection) => (collection.group_id ?? "") === group.id) })).filter((group) => group.collections.length > 0);
}

// ── Page ─────────────────────────────────────────────────────────────────────

function LibraryPage({ library, settings }: { library: Library; settings: Record<string, unknown> }) {
  const [search, set_search] = useState("");
  const [remembered, set_remembered] = use_pref("x-media-tracker-library-filters", remembered_defaults, is_filters);
  const [sort_key, set_sort_key] = use_pref<SortKey>("x-media-tracker-library-sort", "name", one_of(...sort_keys));
  const [descending, set_descending] = use_pref("x-media-tracker-library-descending", false, is_boolean);
  const [grouped, set_grouped] = use_pref("x-media-tracker-library-grouped", false, is_boolean);
  const [rows, set_rows] = use_pref("x-media-tracker-library-rows", false, is_boolean);
  const [refreshing, set_refreshing] = useState(false);

  const genres_on = settings["library.genres_enabled"] !== false;
  const hidden = new Set((settings["library.hidden_genres"] as string[]).map((genre) => genre.toLowerCase()));
  const genres = genres_on ? list_genres(library.titles).filter((genre) => !hidden.has(genre.toLowerCase())) : [];
  const shown_groups = group_filters(library.collections, library.groups);
  // A leftover filter on a genre now hidden, or a group now gone, stops applying.
  const filters: LibraryFilters = {
    ...remembered,
    search,
    genre: genres.some((genre) => genre.toLowerCase() === remembered.genre.toLowerCase()) ? remembered.genre : "all",
    groups: Object.fromEntries(shown_groups.map((group) => [group.id, remembered.groups[group.id] ?? "all"])),
  };
  const set_filter = (change: Partial<LibraryFilters>) => set_remembered({ ...remembered, ...change });
  const counts = facet_counts(library.titles, filters, library.collections, shown_groups.map((group) => group.id));
  const shown = sort_titles(filter_titles(library.titles, filters, library.collections), sort_key, descending);
  const poster_size = String(settings["library.poster_size"]);

  const refresh = async () => {
    set_refreshing(true);
    try {
      const report = await calls().refresh_library();
      toast(`Refreshed ${report.total} titles: ${report.metadata_updated} with new details, ${report.status_updated} with a new status${report.failed ? `, ${report.failed} not found on TMDB` : ""}.`, { tone: "good" });
    } catch (error) {
      toast((error as Error).message, { tone: "bad" });
    } finally {
      set_refreshing(false);
    }
  };

  return (
    <>
      <PageHeading
        title="Library"
        subtitle={`${shown.length} of ${library.titles.length} titles`}
        actions={
          <>
            <a className="button" href="#/library/add">
              Add
            </a>
            <button type="button" disabled={refreshing} onClick={() => void refresh()}>
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </>
        }
      />
      <Toolbar>
        <SearchBox label="Search titles" value={search} on_input={set_search} />
        <Segmented
          label="Type"
          choices={[
            { value: "all", label: with_count("All", counts.media_type.all) },
            { value: "movie", label: with_count("Movies", counts.media_type.movie) },
            { value: "show", label: with_count("TV", counts.media_type.show) },
          ]}
          value={filters.media_type}
          on_change={(media_type) => set_filter({ media_type })}
        />
        <Select
          label="Status"
          options={[["all", with_count("Any status", counts.status.all)], ...statuses.map((status) => [status, with_count(status_labels[status], counts.status[status])] as [string, string])]}
          value={filters.status}
          on_change={(status) => set_filter({ status: status as LibraryFilters["status"] })}
        />
        {genres_on && (
          <Select
            label="Genre"
            options={[["all", with_count("Any genre", counts.genre.all)], ...genres.map((genre) => [genre, with_count(genre, counts.genre[genre.toLowerCase()])] as [string, string])]}
            value={filters.genre}
            on_change={(genre) => set_filter({ genre })}
          />
        )}
        {shown_groups.map((group) => {
          const group_counts = counts.groups[group.id] ?? {};
          return (
            <Select
              key={group.id}
              label={group.name}
              options={[
                ["all", with_count(`Any ${group.name.toLowerCase()}`, group_counts.all)],
                ["none", with_count("None", group_counts.none)],
                ...group.collections.map((collection) => [collection.id, with_count(collection.name, group_counts[collection.id])] as [string, string]),
              ]}
              value={filters.groups[group.id] ?? "all"}
              on_change={(chosen) => set_filter({ groups: { ...remembered.groups, [group.id]: chosen } })}
            />
          );
        })}
        <Select label="Sort by" options={sort_keys.map((key) => [key, sort_labels[key]] as [SortKey, string])} value={sort_key} on_change={set_sort_key} />
        <button type="button" aria-label={descending ? "Sort ascending" : "Sort descending"} onClick={() => set_descending(!descending)}>
          {descending ? "↓" : "↑"}
        </button>
        <Segmented
          label="Grouping"
          choices={[
            { value: "flat", label: "All together" },
            { value: "grouped", label: "By collection" },
          ]}
          value={grouped ? "grouped" : "flat"}
          on_change={(choice) => set_grouped(choice === "grouped")}
        />
        <Segmented
          label="Layout"
          choices={[
            { value: "posters", label: "Posters" },
            { value: "rows", label: "Rows" },
          ]}
          value={rows ? "rows" : "posters"}
          on_change={(choice) => set_rows(choice === "rows")}
        />
      </Toolbar>
      {library.titles.length === 0 ? (
        <Empty title="Nothing tracked yet." hint={<a href="#/library/add">Add a movie or show</a>} />
      ) : shown.length === 0 ? (
        <Empty title="No titles match these filters." />
      ) : grouped ? (
        group_by_collection(shown, library.collections).map(([heading, titles]) => (
          <Section key={heading} title={`${heading} (${titles.length})`}>
            <Tiles titles={titles} poster_size={poster_size} rows={rows} />
          </Section>
        ))
      ) : (
        <Tiles titles={shown} poster_size={poster_size} rows={rows} />
      )}
    </>
  );
}

export function LibraryTab() {
  const library = use_data((api) => api.list_library());
  const settings = use_settings();
  return (
    <div className="library-page">
      <Loaded resource={library}>{(loaded) => <Loaded resource={settings}>{(values) => <LibraryPage library={loaded} settings={values} />}</Loaded>}</Loaded>
    </div>
  );
}
