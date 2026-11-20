// The games' settings: a dialog for each catalogue with its key, and IGDB's import, the statuses and how new games start,
// collections, the launchers a game's page starts games in, a dialog for each store whose library comes in: Steam with its categories, itch.io and Epic, and the
// games' own import and export.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useState } from "react";
import { CommitInput, Switch } from "@x-tech-laboratories/x-libs/web/react/controls";
import { confirm_dialog } from "@x-tech-laboratories/x-libs/web/react/dialog";
import { RowActions, Section, SettingRow, type SettingsSection } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Loaded } from "@x-tech-laboratories/x-libs/web/react/states";

import { calls, use_data } from "../api.ts";
import type { FeatureSettingsProps } from "../features.tsx";
import { PluginRows } from "../plugins.tsx";
import { transfer_section } from "../transfer.tsx";
import { game_merge } from "./merge.tsx";
import {
  game_status_group_labels,
  game_status_groups,
  game_status_of,
  group_status,
  statuses_in_group,
  type GameCollection,
  type GameStatusGroup,
  type GameStatusInfo,
} from "../../shared/games/model.ts";
import { clean_launchers, launcher_labels, launchers } from "../../shared/games/launch.ts";
import { game_catalog_manifests, game_store_manifests } from "../../shared/games/manifests.ts";
import { attempt } from "./actions.tsx";
import { StatusSelect, WithStatuses } from "./StatusPicker.tsx";

// ── Catalogues ───────────────────────────────────────────────────────────────

function CatalogueSettings(props: FeatureSettingsProps) {
  return <PluginRows manifests={game_catalog_manifests.filter((manifest) => !game_store_manifests.includes(manifest))} {...props} />;
}

// ── Statuses ─────────────────────────────────────────────────────────────────

function AddStatus({ group }: { group: GameStatusGroup }) {
  const [label, set_label] = useState("");
  return (
    <form
      className="add-field"
      onSubmit={(event) => {
        event.preventDefault();
        if (label.trim()) attempt(calls().save_game_status({ label: label.trim(), group }).then(() => set_label("")));
      }}
    >
      <input aria-label={`New status in ${game_status_group_labels[group]}`} placeholder={`New status in ${game_status_group_labels[group]}`} value={label} onChange={(event) => set_label(event.currentTarget.value)} />
      <button type="submit">Add</button>
    </form>
  );
}

// Removing names the status its games move to.
function StatusRow({ status, statuses, index, count }: { status: GameStatusInfo; statuses: GameStatusInfo[]; index: number; count: number }) {
  const left = statuses.filter((each) => each.id !== status.id);
  const replacement = left.find((each) => each.id === group_status(left, status.group))?.label ?? "";
  return (
    <li className="collection-row">
      <CommitInput
        aria-label={`Name of ${status.label}`}
        value={status.label}
        on_commit={(event) => {
          const label = event.currentTarget.value.trim();
          if (label && label !== status.label) attempt(calls().save_game_status({ id: status.id, label }));
        }}
      />
      <RowActions
        index={index}
        count={count}
        remove_label={`Remove ${status.label}`}
        on_move={(from, to) => attempt(calls().move_game_status(status.id, to < from ? -1 : 1))}
        on_remove={
          count > 1
            ? () =>
                confirm_dialog({
                  title: `Remove ${status.label}?`,
                  message: `Its games move to ${replacement}.`,
                  confirm_label: "Remove",
                  danger: true,
                  run: () => calls().remove_game_status(status.id),
                })
            : undefined
        }
      />
    </li>
  );
}

// Each group's statuses, in the order the picker and menus show them; a group keeps at least one.
function StatusSettings() {
  return (
    <WithStatuses>
      {(statuses) =>
        game_status_groups.map((group) => {
          const members = statuses_in_group(statuses, group);
          return (
            <Section key={group} title={game_status_group_labels[group]}>
              <ul className="collection-list">
                {members.map((status, index) => (
                  <StatusRow key={status.id} status={status} statuses={statuses} index={index} count={members.length} />
                ))}
              </ul>
              <AddStatus group={group} />
            </Section>
          );
        })
      }
    </WithStatuses>
  );
}

function NewGameSettings({ settings, set_setting }: FeatureSettingsProps) {
  return (
    <SettingRow label="Status for new games" hint="A game added by hand starts with this; an import takes its status from what it imports.">
      <WithStatuses>
        {(statuses) => (
          <StatusSelect
            statuses={statuses}
            label="Status for new games"
            value={game_status_of(statuses, settings["games.default_status"])}
            on_change={(status) => attempt(set_setting("games.default_status", status))}
          />
        )}
      </WithStatuses>
    </SettingRow>
  );
}

// ── Launchers ────────────────────────────────────────────────────────────────

const launcher_hints: Record<(typeof launchers)[number], string> = {
  steam: "Games with a Steam app id.",
  heroic: "Epic games from the Epic import and GOG games refreshed from GOG, on Linux, macOS and Windows.",
  epic: "Games from the Epic import, on Windows and macOS.",
  gog_galaxy: "GOG games refreshed from GOG; Galaxy opens the game's page, with its Play button.",
  lutris: "Games installed in Lutris on this computer, found by their store or title, or any with a Lutris slug set under Change ids.",
};

function LauncherSettings({ settings, set_setting }: FeatureSettingsProps) {
  const chosen = clean_launchers(settings["games.launchers"]);
  const set = (launcher: (typeof launchers)[number], on: boolean) => set_setting("games.launchers", on ? [...chosen, launcher] : chosen.filter((each) => each !== launcher));
  return (
    <>
      {launchers.map((launcher) => (
        <SettingRow key={launcher} label={launcher_labels[launcher]} hint={launcher_hints[launcher]}>
          <Switch label={launcher_labels[launcher]} checked={chosen.includes(launcher)} on_change={(on) => set(launcher, on)} />
        </SettingRow>
      ))}
    </>
  );
}

// ── Collections ──────────────────────────────────────────────────────────────

function CollectionRow({ collection }: { collection: GameCollection }) {
  return (
    <li className="collection-row">
      <CommitInput
        aria-label={`Name of ${collection.name}`}
        value={collection.name}
        on_commit={(event) => {
          const name = event.currentTarget.value.trim();
          if (name && name !== collection.name) attempt(calls().save_game_collection({ id: collection.id, name }));
        }}
      />
      <button
        type="button"
        aria-label={`Remove ${collection.name}`}
        onClick={() => confirm_dialog({ title: `Remove ${collection.name}?`, message: "Its games stay; they only leave this collection.", confirm_label: "Remove", danger: true, run: () => calls().remove_game_collection(collection.id) })}
      >
        ×
      </button>
    </li>
  );
}

function CollectionSettings() {
  const games = use_data((api) => api.list_games());
  const [name, set_name] = useState("");
  return (
    <Loaded resource={games}>
      {(loaded) => (
        <>
          <ul className="collection-list">
            {loaded.collections.map((collection) => (
              <CollectionRow key={collection.id} collection={collection} />
            ))}
          </ul>
          <form
            className="add-field"
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim()) attempt(calls().save_game_collection({ name: name.trim() }).then(() => set_name("")));
            }}
          >
            <input aria-label="New game collection" placeholder="New collection, such as Couch co-op" value={name} onChange={(event) => set_name(event.currentTarget.value)} />
            <button type="submit">Add</button>
          </form>
        </>
      )}
    </Loaded>
  );
}

// ── Sections ─────────────────────────────────────────────────────────────────

export function game_settings(props: FeatureSettingsProps): SettingsSection[] {
  return [
    {
      id: "game-catalogues",
      heading: "Catalogues",
      hint: "Each catalogue is a plugin: turn it off to leave it out of search and details. Wikidata, Steam, GOG and itch.io need no key; the others answer once their key is set.",
      content: <CatalogueSettings {...props} />,
    },
    {
      id: "game-statuses",
      heading: "Game statuses",
      hint: "The statuses in each group, in the order the picker and menus show them. Rename, reorder or remove any, or add your own; a removed status's games move to Backlog, Currently playing or Finished, or the group's first status once that is gone too.",
      content: <StatusSettings />,
    },
    { id: "new-games", heading: "New games", content: <NewGameSettings {...props} /> },
    { id: "game-collections", heading: "Game collections", hint: "Your own shelves, such as Couch co-op or Backlog 2027; a game can be in several.", content: <CollectionSettings /> },
    {
      id: "game-launchers",
      heading: "Launchers",
      hint: "A game's page has a button to start it in each launcher turned on here that knows the game. It starts the game on the computer the page is open on, so it is left out on a phone.",
      content: <LauncherSettings {...props} />,
    },
    { id: "game-stores", heading: "Stores", hint: "The stores whose libraries come in, adding games and merging ones already here; one set to import automatically runs on the schedule under Movies & Series → Automatic imports.", content: <PluginRows manifests={game_store_manifests} {...props} /> },
    transfer_section({
      name: "games",
      noun: "game",
      holds: "Every game with its status, rating, review, notes, owned platforms and stores, edition, playtime and ids, and the collections.",
      export_json: () => calls().export_games_json(),
      export_csv: () => calls().export_games_csv(),
      import_file: (input) => calls().import_games_file(input),
      merging: async () => {
        const games = await calls().list_games();
        return { kind: game_merge(games.statuses), items: games.games };
      },
    }),
  ];
}
