// The games' settings: a dialog for each catalogue with its key, and IGDB's import, the statuses and how new games start,
// collections, a dialog for each store whose library comes in: Steam with its categories, itch.io and Epic, and the
// games' own import and export.

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
import { PluginRows } from "../plugins.tsx";
import { SecretRow, SourceRow, TextRow, key_status } from "../settings/rows.tsx";
import { transfer_section } from "../transfer.tsx";
import { game_merge } from "./merge.tsx";
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
import { epic_sign_in_link } from "../../shared/games/epic.ts";
import { game_catalog_manifests } from "../../shared/games/manifests.ts";
import type { SteamCategoryReport } from "../../shared/games/store.ts";
import { attempt } from "./actions.tsx";
import { StatusSelect } from "./StatusPicker.tsx";

// ── Catalogues ───────────────────────────────────────────────────────────────

function CatalogueSettings() {
  return <PluginRows manifests={game_catalog_manifests} />;
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

// ── Epic Games Store ─────────────────────────────────────────────────────────

function EpicSettings(props: FeatureSettingsProps) {
  const { settings, set_setting } = props;
  const [code, set_code] = useState("");
  const [busy, set_busy] = useState(false);

  const sign_in = () => {
    set_busy(true);
    const work = calls()
      .sign_in_epic(code)
      .then((name) => {
        set_code("");
        toast(`Signed in to the Epic Games Store${name ? ` as ${name}` : ""}.`, { tone: "good" });
      });
    attempt(work.finally(() => set_busy(false)));
  };
  const run = () => {
    set_busy(true);
    const work = calls()
      .import_epic_library()
      .then((report) => toast(`Imported ${report.added} new game(s) and updated ${report.updated} from the Epic Games Store. Refresh in Games fills in details for new ones.`, { tone: "good" }));
    attempt(work.finally(() => set_busy(false)));
  };

  const client_id = String(settings["games.epic_client_id"] ?? "").trim();
  const signed_in = String(settings["games.epic_refresh_token"] ?? "") !== "";
  const account = String(settings["games.epic_account"] ?? "");
  const last = String(settings["games.last_epic_sync"] ?? "");
  const result = String(settings["games.last_epic_result"] ?? "");
  return (
    <>
      <TextRow {...props} label="Launcher client id" setting="games.epic_client_id" placeholder="Paste the client id" hint="Epic lets only its own launcher read a library. Copy the launcher's client id from the Legendary launcher's source, legendary/api/egs.py." />
      <SecretRow {...props} label="Launcher client secret" setting="games.epic_client_secret" placeholder="Paste the client secret" hint="The secret beside that client id in the same file." />
      {signed_in ? (
        <SettingRow label="Account" hint={`Signed in${account ? ` as ${account}` : ""}. Each import renews the sign-in; one left unused for long runs out, and then you sign in again.`}>
          <button type="button" onClick={() => attempt(calls().sign_out_epic())}>
            Sign out
          </button>
        </SettingRow>
      ) : (
        <SettingRow label="Sign in" hint={client_id ? "Open Epic's sign-in page, sign in, and paste the authorizationCode it then shows, or the whole answer." : "Set the client id first."}>
          <form
            className="key-field"
            onSubmit={(event) => {
              event.preventDefault();
              if (code.trim()) sign_in();
            }}
          >
            {client_id && (
              <a href={epic_sign_in_link(client_id)} target="_blank" rel="noreferrer">
                Open sign-in page
              </a>
            )}
            <input aria-label="Epic sign-in code" autoComplete="off" spellCheck={false} placeholder="Paste the code" value={code} onChange={(event) => set_code(event.currentTarget.value)} />
            <button type="submit" disabled={busy || !client_id || !code.trim()}>
              Sign in
            </button>
          </form>
        </SettingRow>
      )}
      <SettingRow label="Import from Epic every" hint={`0 imports only when asked. The server and the desktop app import on this schedule.${last ? ` Last: ${last.slice(0, 16).replace("T", " ")}${result ? ` — ${result}` : ""}.` : ""}`}>
        <NumberField
          label="Import from Epic every"
          bare
          unit="hours"
          min={0}
          value={Number(settings["games.epic_sync_hours"]) || 0}
          on_change={(hours) => attempt(set_setting("games.epic_sync_hours", Math.max(0, Math.round(hours ?? 0))))}
        />
      </SettingRow>
      <SettingRow label="Import now" hint="Adds owned games as Backlog, owned on PC; a game already here gains its Epic id. DLC and add-ons are left out, and Epic gives no playtime.">
        <button type="button" disabled={busy || !signed_in} onClick={run}>
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

// ── Stores ───────────────────────────────────────────────────────────────────

// One row a store, its import and schedule in its dialog.
function StoreSettings(props: FeatureSettingsProps) {
  const { settings } = props;
  const steam_set = String(settings["games.steam_api_key"] ?? "") !== "" && String(settings["games.steam_id"] ?? "") !== "";
  const epic_account = String(settings["games.epic_account"] ?? "");
  const epic_signed_in = String(settings["games.epic_refresh_token"] ?? "") !== "";
  return (
    <>
      <SourceRow name="Steam" status={steam_set ? `Profile ${String(settings["games.steam_id"])}` : "Not set up"} about="Your Steam library with its playtime, your wishlist, and the status each of your Steam categories gives.">
        <SteamSettings {...props} />
        <Section title="Categories" level={3}>
          <p className="source-hint">Give each category of your Steam library a status; its tracked games take that status whenever the categories are read, the furthest along winning for a game in several.</p>
          <SteamCategorySettings {...props} />
        </Section>
      </SourceRow>
      <SourceRow name="itch.io" status={key_status(settings, "games.itchio_api_key")} about="The games your itch.io account has bought or claimed.">
        <ItchioSettings {...props} />
      </SourceRow>
      <SourceRow
        name="Epic Games Store"
        status={epic_signed_in ? `Signed in${epic_account ? ` as ${epic_account}` : ""}` : "Not signed in"}
        about="Reads your Epic library the way the Legendary and Heroic launchers do; Epic publishes no API for it, so it may stop working."
      >
        <EpicSettings {...props} />
      </SourceRow>
    </>
  );
}

// ── Sections ─────────────────────────────────────────────────────────────────

export function game_settings(props: FeatureSettingsProps): SettingsSection[] {
  return [
    {
      id: "game-catalogues",
      heading: "Catalogues",
      hint: "Each catalogue is a plugin: turn it off to leave it out of search and details. Wikidata, Steam, GOG and itch.io need no key; the others answer once their key is set.",
      content: <CatalogueSettings />,
    },
    {
      id: "game-statuses",
      heading: "Game statuses",
      hint: "The statuses in each group, in the order the picker and menus show them. Rename, reorder or remove any, or add your own; a removed status's games move to Backlog, Currently playing or Finished, or the group's first status once that is gone too.",
      content: <StatusSettings />,
    },
    { id: "new-games", heading: "New games", content: <NewGameSettings {...props} /> },
    { id: "game-collections", heading: "Game collections", hint: "Your own shelves, such as Couch co-op or Backlog 2027; a game can be in several.", content: <CollectionSettings /> },
    { id: "game-stores", heading: "Stores", hint: "The stores whose libraries come in, adding games and merging ones already here.", content: <StoreSettings {...props} /> },
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
