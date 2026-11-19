// The games' settings: the catalogues' keys and IGDB's Twitch app, the statuses and how new games start, collections, the Steam profile whose library and
// wishlist come in and how often, the status each Steam category gives, the itch.io account whose library comes in, and
// IGDB's import.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { CommitInput, NumberField } from "@x-tech-laboratories/x-libs/web/react/controls";
import { confirm_dialog } from "@x-tech-laboratories/x-libs/web/react/dialog";
import { RowActions, Section, SettingRow, type SettingsSection } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Loaded } from "@x-tech-laboratories/x-libs/web/react/states";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";

import { calls, page, use_data } from "../api.ts";
import { read_picked } from "../files.ts";
import type { FeatureSettingsProps } from "../features.tsx";
import { SecretRow, TextRow } from "../settings/rows.tsx";
import {
  game_status_group_labels,
  game_status_groups,
  game_status_of,
  group_status,
  is_game_status,
  statuses_in_group,
  type GameCollection,
  type GameStatus,
  type GameStatusGroup,
  type GameStatusInfo,
} from "../../shared/games/model.ts";
import type { SteamCategoryReport } from "../../shared/games/store.ts";
import { attempt } from "./actions.tsx";
import { StatusSelect } from "./StatusPicker.tsx";

// ── Catalogues ───────────────────────────────────────────────────────────────

function CatalogueSettings(props: FeatureSettingsProps) {
  return (
    <>
      <SecretRow {...props} label="RAWG API key" setting="games.rawg_api_key" placeholder="Paste your key" hint="The largest catalogue: search, release days, genres and descriptions. A free key comes with an account at rawg.io/apidocs." />
      <SecretRow
        {...props}
        label="MobyGames API key"
        setting="games.mobygames_api_key"
        placeholder="Paste your key"
        hint="The most careful catalogue, with box art. A free key for personal use is under API on your MobyGames profile; it allows about one request a second."
      />
      <SecretRow {...props} label="Giant Bomb API key" setting="games.giantbomb_api_key" placeholder="Paste your key" hint="Box art and short descriptions. A free key is on your Giant Bomb profile page." />
      <TextRow
        {...props}
        label="IGDB client id"
        setting="games.igdb_client_id"
        placeholder="Paste the client id"
        hint="The biggest catalogue, with box art. Register an application at dev.twitch.tv/console (free; Twitch asks for two-factor sign-in) and paste its client id and a new secret."
      />
      <SecretRow {...props} label="IGDB client secret" setting="games.igdb_client_secret" placeholder="Paste the client secret" hint="The secret of the same Twitch application." />
      <SecretRow
        {...props}
        label="TheGamesDB API key"
        setting="games.thegamesdb_api_key"
        placeholder="Paste your key"
        hint="Strongest on console and older games, with box art. Ask for a free key on the forums at forums.thegamesdb.net; it allows so many requests a month."
      />
      <SecretRow
        {...props}
        label="SteamGridDB API key"
        setting="games.steamgriddb_api_key"
        placeholder="Paste your key"
        hint="Upright box art drawn by its users, for games the other catalogues have no cover for. A free key is under Preferences → API on steamgriddb.com."
      />
    </>
  );
}

// ── Statuses ─────────────────────────────────────────────────────────────────

// The user's statuses, loaded with the games, for the sections that pick one.
function WithStatuses({ children }: { children: (statuses: GameStatusInfo[]) => ReactNode }) {
  const games = use_data((api) => api.list_games());
  return <Loaded resource={games}>{(loaded) => children(loaded.statuses)}</Loaded>;
}

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

// ── Steam ────────────────────────────────────────────────────────────────────

function SteamSettings(props: FeatureSettingsProps) {
  const { settings, set_setting } = props;
  const [busy, set_busy] = useState<"library" | "wishlist" | null>(null);

  const run = (which: "library" | "wishlist") => {
    set_busy(which);
    const work =
      which === "library"
        ? calls()
            .import_steam_library()
            .then((report) => toast(`Imported ${report.added} new game(s) and updated ${report.updated} from Steam. Refresh in Games fills in details for new ones.`, { tone: "good" }))
        : calls()
            .import_steam_wishlist()
            .then((report) => toast(`Wishlist: ${report.added} new, ${report.updated} already tracked.`, { tone: "good" }));
    attempt(work.finally(() => set_busy(null)));
  };

  const last = String(settings["games.last_steam_sync"] ?? "");
  const result = String(settings["games.last_steam_result"] ?? "");
  return (
    <>
      <SecretRow {...props} label="Steam Web API key" setting="games.steam_api_key" placeholder="Paste your key" hint="Reads the games a profile owns and their playtime. Get one at steamcommunity.com/dev/apikey." />
      <TextRow {...props} label="Steam profile" setting="games.steam_id" placeholder="Such as 76561197960287930 or gabelogannewell" hint="The profile's 64-bit id, its custom URL name, or a link to it. Its Game details must be public." />
      <SettingRow label="Import from Steam every" hint={`0 imports only when asked. The server and the desktop app import on this schedule.${last ? ` Last: ${last.slice(0, 16).replace("T", " ")}${result ? ` — ${result}` : ""}.` : ""}`}>
        <NumberField
          label="Import from Steam every"
          bare
          unit="hours"
          min={0}
          value={Number(settings["games.steam_sync_hours"]) || 0}
          on_change={(hours) => attempt(set_setting("games.steam_sync_hours", Math.max(0, Math.round(hours ?? 0))))}
        />
      </SettingRow>
      <SettingRow label="Import now" hint="The library adds owned games as Currently playing or Backlog and updates playtime; the wishlist adds wished games as Wishlist.">
        <span className="game-links">
          <button type="button" disabled={busy !== null} onClick={() => run("library")}>
            {busy === "library" ? "Importing…" : "Import library"}
          </button>
          <button type="button" disabled={busy !== null} onClick={() => run("wishlist")}>
            {busy === "wishlist" ? "Importing…" : "Import wishlist"}
          </button>
        </span>
      </SettingRow>
    </>
  );
}

// ── itch.io ──────────────────────────────────────────────────────────────────

function ItchioSettings(props: FeatureSettingsProps) {
  const { settings, set_setting } = props;
  const [busy, set_busy] = useState(false);

  const run = () => {
    set_busy(true);
    const work = calls()
      .import_itchio_library()
      .then((report) => toast(`Imported ${report.added} new game(s) and updated ${report.updated} from itch.io. Refresh in Games fills in details for new ones.`, { tone: "good" }));
    attempt(work.finally(() => set_busy(false)));
  };

  const last = String(settings["games.last_itchio_sync"] ?? "");
  const result = String(settings["games.last_itchio_result"] ?? "");
  return (
    <>
      <SecretRow {...props} label="itch.io API key" setting="games.itchio_api_key" placeholder="Paste your key" hint="Reads the games your account has bought or claimed. Make one at itch.io/user/settings/api-keys." />
      <SettingRow label="Import from itch.io every" hint={`0 imports only when asked. The server and the desktop app import on this schedule.${last ? ` Last: ${last.slice(0, 16).replace("T", " ")}${result ? ` — ${result}` : ""}.` : ""}`}>
        <NumberField
          label="Import from itch.io every"
          bare
          unit="hours"
          min={0}
          value={Number(settings["games.itchio_sync_hours"]) || 0}
          on_change={(hours) => attempt(set_setting("games.itchio_sync_hours", Math.max(0, Math.round(hours ?? 0))))}
        />
      </SettingRow>
      <SettingRow label="Import now" hint="Adds owned games as Backlog, owned on PC or Android; a game already here gains its itch.io page. itch.io gives no playtime.">
        <button type="button" disabled={busy} onClick={run}>
          {busy ? "Importing…" : "Import library"}
        </button>
      </SettingRow>
    </>
  );
}

// ── Steam categories ─────────────────────────────────────────────────────────

function report_categories(report: SteamCategoryReport): void {
  const untracked = report.untracked ? `; ${report.untracked} in a mapped category are not tracked yet, so import the library first` : "";
  toast(`Read ${report.categories} Steam categories and changed the status of ${report.updated} game(s)${untracked}.`, { tone: "good" });
}

// Each category last read from Steam, and any mapped since, with the status its games take.
function SteamCategorySettings({ settings }: FeatureSettingsProps) {
  const file = useRef<HTMLInputElement>(null);
  const { steam_files } = page();
  const mapping = (settings["games.steam_category_statuses"] ?? {}) as Record<string, string>;
  const seen = (settings["games.steam_categories"] ?? []) as string[];
  const names = [...new Set([...seen, ...Object.keys(mapping)])].sort((first, second) => first.localeCompare(second));
  const status_of = (statuses: GameStatusInfo[], name: string): GameStatus | "" => {
    const status = Object.entries(mapping).find(([each]) => each.toLowerCase() === name.toLowerCase())?.[1];
    return is_game_status(statuses, status) ? status : "";
  };

  const import_text = (text: string) => attempt(calls().import_steam_categories(text).then(report_categories));

  async function pick(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const text = await read_picked(event);
    if (text !== null) import_text(text);
  }

  const read_here = () =>
    attempt(
      steam_files!.read_steam_categories().then((text) => {
        if (text) import_text(text);
        else toast("Steam's files are not on this computer; pick the categories file instead.", { tone: "bad" });
      }),
    );

  return (
    <>
      <SettingRow
        label="Read categories"
        hint={`Steam keeps your library's categories only on the computers it runs on, in userdata/<account>/config/cloudstorage/cloud-storage-namespace-1.json.${steam_files ? " This app also reads them from this computer every hour." : ""}`}
      >
        <span className="game-links">
          {steam_files && (
            <button type="button" onClick={read_here}>
              Read from this computer
            </button>
          )}
          <input ref={file} type="file" accept="application/json,.json" hidden aria-label="Steam categories file" onChange={(event) => void pick(event)} />
          <button type="button" onClick={() => file.current?.click()}>
            Pick file…
          </button>
        </span>
      </SettingRow>
      <WithStatuses>
        {(statuses) =>
          names.map((name) => (
            <SettingRow key={name} label={name}>
              <StatusSelect
                statuses={statuses}
                label={`Status for ${name}`}
                blank_label="Leave as is"
                value={status_of(statuses, name)}
                on_change={(status) => attempt(calls().set_steam_category_status(name, status))}
              />
            </SettingRow>
          ))
        }
      </WithStatuses>
    </>
  );
}

// ── IGDB ─────────────────────────────────────────────────────────────────────

function IgdbSettings() {
  const file = useRef<HTMLInputElement>(null);

  async function import_export(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const text = await read_picked(event);
    if (text === null) return;
    try {
      const report = await calls().import_igdb_export(text);
      toast(`Imported ${report.added} new game(s) and merged ${report.updated} already here. Refresh in Games finds the new ones' details.`, { tone: "good" });
    } catch (error) {
      toast(`Could not import: ${(error as Error).message}`, { tone: "bad" });
    }
  }

  return (
    <SettingRow
      label="Import from IGDB"
      hint="The index.html from IGDB's data export (Settings → Privacy, unzipped): Want to Play, Playing and Played become statuses, your own lists collections, with ratings and reviews. Games are matched by title."
    >
      <input ref={file} type="file" accept="text/html,.html" hidden aria-label="IGDB export file" onChange={(event) => void import_export(event)} />
      <button type="button" onClick={() => file.current?.click()}>
        Import IGDB…
      </button>
    </SettingRow>
  );
}

// ── Sections ─────────────────────────────────────────────────────────────────

export function game_settings(props: FeatureSettingsProps): SettingsSection[] {
  return [
    {
      id: "game-catalogues",
      heading: "Catalogues",
      hint: "Wikidata and Steam's store need no key: they link a game across the catalogues and fill in what the others lack. Each key adds that catalogue to search and details.",
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
    { id: "steam", heading: "Steam", content: <SteamSettings {...props} /> },
    {
      id: "steam-categories",
      heading: "Steam categories",
      hint: "Give each category of your Steam library a status; its tracked games take that status whenever the categories are read, the furthest along winning for a game in several.",
      content: <SteamCategorySettings {...props} />,
    },
    { id: "itchio", heading: "itch.io", content: <ItchioSettings {...props} /> },
    { id: "igdb", heading: "IGDB", hint: "IGDB's API gives only its catalogue, so your IGDB lists come in through its data export.", content: <IgdbSettings /> },
  ];
}
