// The Library: every tracked title as a poster, narrowed by type, status, genre and each collection group, each choice
// showing how many titles it would leave, sorted, shown as posters or a table, and optionally grouped under its
// collections.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { MediaGrid, MediaTile } from "@x-tech-laboratories/x-libs/web/react/media";
import { MenuButton } from "@x-tech-laboratories/x-libs/web/react/menu_button";
import { Segmented, Select } from "@x-tech-laboratories/x-libs/web/react/controls";
import { PageHeading, Section, Stack, Toolbar } from "@x-tech-laboratories/x-libs/web/react/layout";
import { ProgressBar } from "@x-tech-laboratories/x-libs/web/react/progress";
import { Empty, Loaded } from "@x-tech-laboratories/x-libs/web/react/states";
import { DataTable, type TableColumn } from "@x-tech-laboratories/x-libs/web/react/table";
import { is_boolean, one_of } from "@x-tech-laboratories/x-libs/web/prefs";
import { use_pref } from "@x-tech-laboratories/x-libs/web/react/prefs";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";

import { calls, data_watch, use_data, use_settings } from "../api.ts";
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
import type { Library, LibraryRefresh, RefreshReport } from "../../shared/library/store.ts";
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

function href_of(title: LibraryTitle): string {
  return `#/library/title/${encodeURIComponent(title.id)}`;
}

function TitleActions({ title }: { title: LibraryTitle }) {
  const remove = async () => {
    await calls().remove_title(title.id);
    toast(`Removed ${title.name}.`, { link: { href: "#/history", text: "History" } });
  };
  return (
    <MenuButton
      label={`${title.name} actions`}
      items={() => [...status_menu_items(title), { label: "Remove", danger: true, separator_before: true, run: () => void remove() }]}
    />
  );
}

function TitleTile({ title, poster_size }: { title: LibraryTitle; poster_size: string }) {
  return (
    <MediaTile
      title={title.name}
      href={href_of(title)}
      image={image_url(title.poster_path, poster_size)}
      corner={progress_text(title) || undefined}
      lines={[[title.year, title.media_type === "show" ? "TV" : "Movie"].filter(Boolean).join(" · "), status_labels[title.status]]}
      dimmed={title.status === "dropped"}
      actions={<TitleActions title={title} />}
    />
  );
}

const table_columns: TableColumn<LibraryTitle>[] = [
  { label: "Title", cell: (title) => <a href={href_of(title)}>{title.name}</a> },
  { label: "Year", cell: (title) => title.year || "—" },
  { label: "Type", cell: (title) => (title.media_type === "show" ? "TV" : "Movie") },
  { label: "Status", cell: (title) => status_labels[title.status] },
  { label: "Rating", cell: (title) => (title.rating ? `★ ${title.rating}` : "—") },
  { label: "Episodes", cell: (title) => (title.media_type === "show" ? (title.total_episodes ? `${title.watched_count}/${title.total_episodes}` : String(title.watched_count)) : "—") },
  { label: "Last watched", cell: (title) => title.last_watched || "—" },
  { label: "Added", cell: (title) => title.added_at || "—" },
  { label: "Actions", id: "actions", header: <span className="visually-hidden">Actions</span>, class: "actions-cell", cell: (title) => <TitleActions title={title} /> },
];

function Titles({ titles, poster_size, layout }: { titles: LibraryTitle[]; poster_size: string; layout: Layout }) {
  if (layout === "table") return <DataTable caption="Titles" columns={table_columns} rows={titles} row_key={(title) => title.id} />;
  return (
    <MediaGrid label="Titles">
      {titles.map((title) => (
        <TitleTile key={title.id} title={title} poster_size={poster_size} />
      ))}
    </MediaGrid>
  );
}

type Layout = "posters" | "table";

// ── Filters ──────────────────────────────────────────────────────────────────

function with_count(label: string, count: number | undefined): string {
  return `${label} (${count ?? 0})`;
}

// One select per collection group that has collections, then one for collections in no group.
function group_filters(collections: Collection[], groups: CollectionGroup[]): { id: string; name: string; collections: Collection[] }[] {
  const shown = [...groups.map((group) => ({ id: group.id, name: group.name })), { id: "", name: groups.length ? "Other collections" : "Collection" }];
  return shown.map((group) => ({ ...group, collections: collections.filter((collection) => (collection.group_id ?? "") === group.id) })).filter((group) => group.collections.length > 0);
}

// ── Refresh ──────────────────────────────────────────────────────────────────

const refresh_poll_milliseconds = 1000;

function report_text(report: RefreshReport): string {
  return `Refreshed ${report.total} titles: ${report.metadata_updated} with new details, ${report.status_updated} with a new status${report.failed ? `, ${report.failed} not found on TMDB` : ""}.`;
}

// The refresh runs on its own wherever the library is kept; the page follows it while it runs, including one already
// running when the page opens, and reports it once it ends.
function use_library_refresh(): { refresh: LibraryRefresh | null; start: () => void } {
  const [refresh, set_refresh] = useState<LibraryRefresh | null>(null);

  const follow = (next: LibraryRefresh, was_running: boolean): void => {
    set_refresh(next);
    if (!was_running || next.state === "running") return;
    data_watch.bump();
    if (next.state === "done" && next.report) toast(report_text(next.report), { tone: "good" });
    if (next.state === "failed") toast(`Could not refresh: ${next.error}`, { tone: "bad" });
  };

  useEffect(() => {
    let live = true;
    void calls()
      .get_library_refresh()
      .then((first) => {
        if (live) set_refresh(first);
      })
      .catch(() => undefined);
    return () => void (live = false);
  }, []);

  useEffect(() => {
    if (refresh?.state !== "running") return;
    let live = true;
    const timer = setTimeout(() => {
      void calls()
        .get_library_refresh()
        .then((next) => {
          if (live) follow(next, true);
        })
        .catch((error: unknown) => {
          if (!live) return;
          set_refresh(null);
          toast((error as Error).message, { tone: "bad" });
        });
    }, refresh_poll_milliseconds);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [refresh]);

  const start = (): void => {
    calls()
      .refresh_library()
      .then((started) => follow(started, true))
      .catch((error: unknown) => toast((error as Error).message, { tone: "bad" }));
  };

  return { refresh, start };
}

// ── Page ─────────────────────────────────────────────────────────────────────

function LibraryPage({ library, settings }: { library: Library; settings: Record<string, unknown> }) {
  const [remembered, set_remembered] = use_pref("x-media-tracker-library-filters", remembered_defaults, is_filters);
  const [sort_key, set_sort_key] = use_pref<SortKey>("x-media-tracker-library-sort", "name", one_of(...sort_keys));
  const [descending, set_descending] = use_pref("x-media-tracker-library-descending", false, is_boolean);
  const [grouped, set_grouped] = use_pref("x-media-tracker-library-grouped", false, is_boolean);
  const [layout, set_layout] = use_pref<Layout>("x-media-tracker-library-layout", "posters", one_of("posters", "table"));
  const { refresh, start: start_refresh } = use_library_refresh();
  const refreshing = refresh?.state === "running";

  const genres_on = settings["library.genres_enabled"] !== false;
  const hidden = new Set((settings["library.hidden_genres"] as string[]).map((genre) => genre.toLowerCase()));
  const genres = genres_on ? list_genres(library.titles).filter((genre) => !hidden.has(genre.toLowerCase())) : [];
  const shown_groups = group_filters(library.collections, library.groups);
  // A leftover filter on a genre now hidden, or a group now gone, stops applying.
  const filters: LibraryFilters = {
    ...remembered,
    search: "",
    genre: genres.some((genre) => genre.toLowerCase() === remembered.genre.toLowerCase()) ? remembered.genre : "all",
    groups: Object.fromEntries(shown_groups.map((group) => [group.id, remembered.groups[group.id] ?? "all"])),
  };
  const set_filter = (change: Partial<LibraryFilters>) => set_remembered({ ...remembered, ...change });
  const counts = facet_counts(library.titles, filters, library.collections, shown_groups.map((group) => group.id));
  const shown = sort_titles(filter_titles(library.titles, filters, library.collections), sort_key, descending);
  const poster_size = String(settings["library.poster_size"]);

  return (
    <Stack>
      <PageHeading
        title="Library"
        subtitle={`${shown.length} of ${library.titles.length} titles`}
        actions={
          <button type="button" disabled={refreshing} onClick={start_refresh}>
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        }
      />
      {refreshing && <ProgressBar value={refresh.total ? refresh.done : null} max={refresh.total} label="Refreshing from TMDB" detail={`${refresh.done} of ${refresh.total} titles`} />}
      <Toolbar>
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
        <button type="button" className="icon" aria-label={descending ? "Sort ascending" : "Sort descending"} onClick={() => set_descending(!descending)}>
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
            { value: "table", label: "Table" },
          ]}
          value={layout}
          on_change={set_layout}
        />
      </Toolbar>
      {library.titles.length === 0 ? (
        <Empty title="Nothing tracked yet." hint="Search for a movie or show in the bar at the top to add it." />
      ) : shown.length === 0 ? (
        <Empty title="No titles match these filters." />
      ) : grouped ? (
        group_by_collection(shown, library.collections).map(([heading, titles]) => (
          <Section key={heading} title={`${heading} (${titles.length})`}>
            <Titles titles={titles} poster_size={poster_size} layout={layout} />
          </Section>
        ))
      ) : (
        <Titles titles={shown} poster_size={poster_size} layout={layout} />
      )}
    </Stack>
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
