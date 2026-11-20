// Choosing a game's status: its group first, then a status in that group, or one select holding every status by group.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { ReactNode } from "react";
import { Segmented, Select } from "@x-tech-laboratories/x-libs/web/react/controls";
import { Loaded } from "@x-tech-laboratories/x-libs/web/react/states";

import { use_data } from "../api.ts";

import { game_status_group_labels, game_status_groups, game_status_info, group_status, statuses_in_group, type GameStatus, type GameStatusInfo } from "../../shared/games/model.ts";

// ── Picker ───────────────────────────────────────────────────────────────────

// Picking another group gives the game that group's status to start from, such as Currently playing.
export function StatusPicker({ statuses, status, on_change }: { statuses: GameStatusInfo[]; status: GameStatus; on_change: (status: GameStatus) => void }) {
  const group = game_status_info(statuses, status).group;
  return (
    <span className="game-status">
      <Segmented
        label="Status group"
        choices={game_status_groups.map((each) => ({ value: each, label: game_status_group_labels[each] }))}
        value={group}
        on_change={(chosen) => chosen !== group && on_change(group_status(statuses, chosen))}
      />
      <Segmented label="Status" choices={statuses_in_group(statuses, group).map((each) => ({ value: each.id, label: each.label }))} value={status} on_change={on_change} />
    </span>
  );
}

// ── Select ───────────────────────────────────────────────────────────────────

// Every status under its group's heading; with blank_label, an empty choice comes first.
export function StatusSelect({ statuses, label, value, blank_label, on_change }: { statuses: GameStatusInfo[]; label: string; value: GameStatus | ""; blank_label?: string; on_change: (status: GameStatus | "") => void }) {
  return (
    <Select<GameStatus | "">
      label={label}
      options={blank_label ? [["", blank_label]] : []}
      groups={game_status_groups.map((group) => ({ label: game_status_group_labels[group], options: statuses_in_group(statuses, group).map((each) => [each.id, each.label] as [GameStatus, string]) }))}
      value={value}
      on_change={on_change}
    />
  );
}

// The user's statuses, loaded with the games, for the parts that pick one.
export function WithStatuses({ children }: { children: (statuses: GameStatusInfo[]) => ReactNode }) {
  const games = use_data((api) => api.list_games());
  return <Loaded resource={games}>{(loaded) => children(loaded.statuses)}</Loaded>;
}
