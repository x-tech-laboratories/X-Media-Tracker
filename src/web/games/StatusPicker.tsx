// Choosing a game's status: its group first, then a status in that group, or one select holding every status by group.

// ── Imports ──────────────────────────────────────────────────────────────────

import { Segmented, Select } from "@x-tech-laboratories/x-libs/web/react/controls";

import { game_group_status, game_status_group_labels, game_status_group_of, game_status_groups, game_status_labels, statuses_in_group, type GameStatus } from "../../shared/games/model.ts";

// ── Picker ───────────────────────────────────────────────────────────────────

// Picking another group gives the game that group's first status to play from, such as Currently playing.
export function StatusPicker({ status, on_change }: { status: GameStatus; on_change: (status: GameStatus) => void }) {
  const group = game_status_group_of[status];
  return (
    <span className="game-status">
      <Segmented
        label="Status group"
        choices={game_status_groups.map((each) => ({ value: each, label: game_status_group_labels[each] }))}
        value={group}
        on_change={(chosen) => chosen !== group && on_change(game_group_status[chosen])}
      />
      <Segmented label="Status" choices={statuses_in_group(group).map((each) => ({ value: each, label: game_status_labels[each] }))} value={status} on_change={on_change} />
    </span>
  );
}

// ── Select ───────────────────────────────────────────────────────────────────

// Every status under its group's heading; with blank_label, an empty choice comes first.
export function StatusSelect({ label, value, blank_label, on_change }: { label: string; value: GameStatus | ""; blank_label?: string; on_change: (status: GameStatus | "") => void }) {
  return (
    <Select<GameStatus | "">
      label={label}
      options={blank_label ? [["", blank_label]] : []}
      groups={game_status_groups.map((group) => ({ label: game_status_group_labels[group], options: statuses_in_group(group).map((each) => [each, game_status_labels[each]] as [GameStatus, string]) }))}
      value={value}
      on_change={on_change}
    />
  );
}
