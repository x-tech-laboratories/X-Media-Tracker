// The Games library: every tracked game as a cover or a table row, narrowed by status, platform owned on, store owned
// from and collection,
// each choice showing how many games it would leave, and sorted.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useMemo } from "react";
import { MediaGrid, MediaTile } from "@x-tech-laboratories/x-libs/web/react/media";
import { MenuButton } from "@x-tech-laboratories/x-libs/web/react/menu_button";
import { Segmented, Select, TreeSelect } from "@x-tech-laboratories/x-libs/web/react/controls";
import { PageHeading, Stack, Toolbar } from "@x-tech-laboratories/x-libs/web/react/layout";
import { ProgressBar } from "@x-tech-laboratories/x-libs/web/react/progress";
import { Empty, Loaded } from "@x-tech-laboratories/x-libs/web/react/states";
import { DataTable, type TableColumn } from "@x-tech-laboratories/x-libs/web/react/table";
import { is_boolean, one_of } from "@x-tech-laboratories/x-libs/web/prefs";
import { use_pref } from "@x-tech-laboratories/x-libs/web/react/prefs";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";

import { calls, use_data } from "../api.ts";
import { use_refresh } from "../refresh.ts";
import {
  filter_games,
  format_playtime,
  game_facet_counts,
  game_kind_labels,
  game_sort_keys,
  game_sort_labels,
  game_status_group_labels,
  game_status_groups,
  game_status_text,
  no_game_filters,
  owned_platforms_of,
  owned_stores_of,
  sort_games,
  type GameCollection,
  type GameFilters,
  type GameSortKey,
  type GameStatusInfo,
  type LibraryGame,
} from "../../shared/games/model.ts";
import type { Games, GamesRefreshReport } from "../../shared/games/store.ts";
import { game_href, game_status_menu_items, stars_text } from "./actions.tsx";
import { use_cover } from "../covers.tsx";
import { GroupedList, rating_key, type Grouping } from "../grouping.tsx";

// ── Remembered view ──────────────────────────────────────────────────────────

// Filters remembered before DLC had a filter of their own still count, showing games.
function is_filters(value: unknown): value is Omit<GameFilters, "search"> {
  const filters = value as Partial<GameFilters> | null;
  return !!filters && typeof filters.status === "string" && typeof filters.platform === "string" && typeof filters.collection === "string";
}

function status_filters(statuses: GameStatusInfo[]): string[] {
  return ["all", ...game_status_groups, ...statuses.map((status) => status.id)];
}

// Each group, with its statuses under it, for the status filter.
function status_tree(statuses: GameStatusInfo[]) {
  return [
    ...game_status_groups.map((group, position) => ({ id: group, parent_id: null, position })),
    ...statuses.map((status, position) => ({ id: status.id, parent_id: status.group, position })),
  ];
}

function status_name(statuses: GameStatusInfo[], id: string): string {
  return id in game_status_group_labels ? game_status_group_labels[id as keyof typeof game_status_group_labels] : (statuses.find((status) => status.id === id)?.label ?? "");
}

const game_kinds: GameFilters["kind"][] = ["games", "dlc", "all"];

const { search: _search, ...remembered_defaults } = no_game_filters;

type Layout = "covers" | "table";

// ── Tiles ────────────────────────────────────────────────────────────────────

function GameActions({ game, statuses }: { game: LibraryGame; statuses: GameStatusInfo[] }) {
  const remove = async () => {
    await calls().remove_game(game.id);
    toast(`Removed ${game.title}.`, { link: { href: "#/history", text: "History" } });
  };
  return <MenuButton label={`${game.title} actions`} items={() => [...game_status_menu_items(game, statuses), { label: "Remove", danger: true, separator_before: true, run: () => void remove() }]} />;
}

function GameTile({ game, statuses }: { game: LibraryGame; statuses: GameStatusInfo[] }) {
  const image = use_cover(game.cover_file, game.cover_url);
  return (
    <MediaTile
      title={game.title}
      href={game_href(game.id)}
      image={image}
      corner={stars_text(game.rating) || undefined}
      lines={[[game.year, format_playtime(game.playtime_minutes)].filter(Boolean).join(" · "), game.status_label]}
      dimmed={game.status === "abandoned"}
      actions={<GameActions game={game} statuses={statuses} />}
    />
  );
}

function table_columns(statuses: GameStatusInfo[]): TableColumn<LibraryGame>[] {
  return [
    { label: "Title", cell: (game) => <a href={game_href(game.id)}>{game.title}</a> },
    { label: "Year", cell: (game) => game.year || "—" },
    { label: "Status", cell: (game) => `${game_status_group_labels[game.status_group]} · ${game.status_label}` },
    { label: "Rating", cell: (game) => stars_text(game.rating) || "—" },
    { label: "Owned on", cell: (game) => game.owned_platforms.join(", ") || "—" },
    { label: "Owned from", cell: (game) => game.owned_stores.join(", ") || "—" },
    { label: "Playtime", cell: (game) => format_playtime(game.playtime_minutes) || "—" },
    { label: "Last played", cell: (game) => game.last_played || "—" },
    { label: "Added", cell: (game) => game.added_at || "—" },
    { label: "Actions", id: "actions", header: <span className="visually-hidden">Actions</span>, class: "actions-cell", cell: (game) => <GameActions game={game} statuses={statuses} /> },
  ];
}

function GameTable({ games, statuses }: { games: LibraryGame[]; statuses: GameStatusInfo[] }) {
  const columns = useMemo(() => table_columns(statuses), [statuses]);
  return <DataTable caption="Games" columns={columns} rows={games} row_key={(game) => game.id} />;
}

function GameList({ games, statuses, grouping, layout }: { games: LibraryGame[]; statuses: GameStatusInfo[]; grouping: Grouping<LibraryGame> | undefined; layout: Layout }) {
  const tile = (game: LibraryGame) => <GameTile key={game.id} game={game} statuses={statuses} />;
  if (grouping) return <GroupedList items={games} grouping={grouping} as_table={layout === "table"} tile={tile} table={(members) => <GameTable games={members} statuses={statuses} />} />;
  if (layout === "table") return <GameTable games={games} statuses={statuses} />;
  return <MediaGrid label="Games">{games.map(tile)}</MediaGrid>;
}

// ── Groups ───────────────────────────────────────────────────────────────────

const group_keys = ["none", "status_group", "status", "platform", "store", "collection", "year", "rating"] as const;

type GroupKey = (typeof group_keys)[number];

// The ways the games can be grouped, the collections named by the library's own.
function game_groupings(collections: GameCollection[], statuses: GameStatusInfo[]): Record<Exclude<GroupKey, "none">, Grouping<LibraryGame>> {
  const collection_names = new Map(collections.map((collection) => [collection.id, collection.name]));
  return {
    status_group: { label: "Status group", keys_of: (game) => game.status_group, order: game_status_groups, name_of: (key) => status_name(statuses, key ?? "") },
    status: { label: "Status", keys_of: (game) => game.status, order: statuses.map((status) => status.id), name_of: (key) => (key ? game_status_text(statuses, key) : "") },
    platform: { label: "Owned on", keys_of: (game) => game.owned_platforms, name_of: (key) => key ?? "Not owned" },
    store: { label: "Owned from", keys_of: (game) => game.owned_stores, name_of: (key) => key ?? "No store" },
    collection: {
      label: "Collection",
      keys_of: (game) => game.collection_ids.flatMap((id) => collection_names.get(id) ?? []),
      name_of: (key) => key ?? "In no collection",
    },
    year: { label: "Year", keys_of: (game) => game.year || null, descending: true, name_of: (key) => key ?? "No year" },
    rating: { label: "Rating", keys_of: (game) => rating_key(game.rating), descending: true, name_of: (key) => (key ? `★ ${key}` : "Unrated") },
  };
}

function with_count(label: string, count: number | undefined): string {
  return `${label} (${count ?? 0})`;
}

// ── Refresh ──────────────────────────────────────────────────────────────────

function use_games_refresh() {
  return use_refresh(
    () => calls().get_games_refresh(),
    () => calls().refresh_games(),
    (report: GamesRefreshReport) => `Refreshed ${report.total} games: ${report.updated} updated${report.failed ? `, ${report.failed} not found` : ""}.`,
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

function LibraryPage({ library }: { library: Games }) {
  const [remembered, set_remembered] = use_pref("x-media-tracker-games-filters", remembered_defaults, is_filters);
  const [sort_key, set_sort_key] = use_pref<GameSortKey>("x-media-tracker-games-sort", "title", one_of(...game_sort_keys));
  const [descending, set_descending] = use_pref("x-media-tracker-games-descending", false, is_boolean);
  const [layout, set_layout] = use_pref<Layout>("x-media-tracker-games-layout", "covers", one_of("covers", "table"));
  const [group_by, set_group_by] = use_pref<GroupKey>("x-media-tracker-games-group-by", "none", one_of(...group_keys));
  const { refresh, start: start_refresh } = use_games_refresh();
  const refreshing = refresh?.state === "running";

  const platforms = owned_platforms_of(library.games);
  const stores = owned_stores_of(library.games);
  // A remembered platform, store or collection that is gone stops applying.
  const platform = remembered.platform === "all" || remembered.platform === "none" || platforms.includes(remembered.platform) ? remembered.platform : "all";
  const store = remembered.store === "all" || remembered.store === "none" || stores.includes(remembered.store) ? remembered.store : "all";
  const collection = remembered.collection === "all" || remembered.collection === "none" || library.collections.some((each) => each.id === remembered.collection) ? remembered.collection : "all";
  // A remembered status from before IGDB's statuses stops applying too.
  const status = status_filters(library.statuses).includes(remembered.status) ? remembered.status : "all";
  const filters: GameFilters = { ...remembered_defaults, ...remembered, search: "", status, platform, store, collection };
  const set_filter = (change: Partial<GameFilters>) => set_remembered({ ...remembered, ...change });
  const counts = game_facet_counts(library.games, filters);
  const shown = sort_games(filter_games(library.games, filters), sort_key, descending);
  const groupings = game_groupings(library.collections, library.statuses);

  return (
    <Stack>
      <PageHeading
        title="Games"
        subtitle={`${shown.length} of ${library.games.length} games`}
        actions={
          <button type="button" disabled={refreshing} onClick={start_refresh}>
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        }
      />
      {refreshing && <ProgressBar value={refresh.total ? refresh.done : null} max={refresh.total} label="Refreshing from the catalogues" detail={`${refresh.done} of ${refresh.total} games`} />}
      <Toolbar>
        <Segmented
          label="Kind"
          choices={game_kinds.map((kind) => ({ value: kind, label: with_count(game_kind_labels[kind], counts.kind[kind]) }))}
          value={filters.kind}
          on_change={(kind) => set_filter({ kind })}
        />
        <TreeSelect
          label="Status"
          items={status_tree(library.statuses)}
          name_of={(item) => with_count(status_name(library.statuses, item.id), counts.status[item.id])}
          blank_label={with_count("Any status", counts.status.all)}
          value={filters.status === "all" ? "" : filters.status}
          on_change={(chosen) => set_filter({ status: (chosen || "all") as GameFilters["status"] })}
        />
        <Select
          label="Owned on"
          options={[
            ["all", with_count("Any platform", counts.platform.all)],
            ...platforms.map((each) => [each, with_count(each, counts.platform[each])] as [string, string]),
            ["none", with_count("Not owned", counts.platform.none)],
          ]}
          value={filters.platform}
          on_change={(chosen) => set_filter({ platform: chosen })}
        />
        <Select
          label="Owned from"
          options={[
            ["all", with_count("Any store", counts.store.all)],
            ...stores.map((each) => [each, with_count(each, counts.store[each])] as [string, string]),
            ["none", with_count("No store", counts.store.none)],
          ]}
          value={filters.store}
          on_change={(chosen) => set_filter({ store: chosen })}
        />
        {library.collections.length > 0 && (
          <Select
            label="Collection"
            options={[
              ["all", with_count("Any collection", counts.collection.all)],
              ["none", with_count("None", counts.collection.none)],
              ...library.collections.map((each) => [each.id, with_count(each.name, counts.collection[each.id])] as [string, string]),
            ]}
            value={filters.collection}
            on_change={(chosen) => set_filter({ collection: chosen })}
          />
        )}
        <Select label="Sort by" options={game_sort_keys.map((key) => [key, game_sort_labels[key]] as [GameSortKey, string])} value={sort_key} on_change={set_sort_key} />
        <button type="button" className="icon" aria-label={descending ? "Sort ascending" : "Sort descending"} onClick={() => set_descending(!descending)}>
          {descending ? "↓" : "↑"}
        </button>
        <Select label="Group by" options={group_keys.map((key) => [key, key === "none" ? "Nothing" : groupings[key].label] as [GroupKey, string])} value={group_by} on_change={set_group_by} />
        <Segmented
          label="Layout"
          choices={[
            { value: "covers", label: "Covers" },
            { value: "table", label: "Table" },
          ]}
          value={layout}
          on_change={set_layout}
        />
      </Toolbar>
      {library.games.length === 0 ? (
        <Empty title="No games yet." hint="Search for a game in the bar at the top, paste a store link, or import your Steam library or IGDB lists under Settings → Games." />
      ) : shown.length === 0 ? (
        <Empty title="No games match these filters." />
      ) : (
        <GameList games={shown} statuses={library.statuses} grouping={group_by === "none" ? undefined : groupings[group_by]} layout={layout} />
      )}
    </Stack>
  );
}

export function GamesLibrary() {
  const library = use_data((api) => api.list_games());
  return (
    <div className="games-page">
      <Loaded resource={library}>{(loaded) => <LibraryPage library={loaded} />}</Loaded>
    </div>
  );
}
