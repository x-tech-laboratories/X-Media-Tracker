// The games' settings: the catalogues' keys, how new games start, collections, the Steam profile whose library and
// wishlist come in and how often, and the Trilium Game Tracker's and IGDB's imports.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useRef, useState, type ChangeEvent } from "react";
import { CommitInput, NumberField, Segmented } from "@x-tech-laboratories/x-libs/web/react/controls";
import { confirm_dialog } from "@x-tech-laboratories/x-libs/web/react/dialog";
import { SettingRow, type SettingsSection } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Loaded } from "@x-tech-laboratories/x-libs/web/react/states";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";

import { calls, use_data } from "../api.ts";
import { read_picked } from "../files.ts";
import type { FeatureSettingsProps } from "../features.tsx";
import { SecretRow, TextRow } from "../settings/rows.tsx";
import { game_status_labels, game_statuses, type GameCollection } from "../../shared/games/model.ts";
import { attempt } from "./actions.tsx";

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
    </>
  );
}

function NewGameSettings({ settings, set_setting }: FeatureSettingsProps) {
  return (
    <SettingRow label="Status for new games" hint="A game added by hand starts with this; an import takes its status from what it imports.">
      <Segmented
        label="Status for new games"
        choices={game_statuses.map((status) => ({ value: status, label: game_status_labels[status] }))}
        value={String(settings["games.default_status"]) as (typeof game_statuses)[number]}
        on_change={(status) => attempt(set_setting("games.default_status", status))}
      />
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
            .then((report) => toast(`Wishlist: ${report.added} new, ${report.updated} already tracked, ${report.removed} no longer wished.`, { tone: "good" }));
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
      <SettingRow label="Import now" hint="The library adds owned games as Playing or Want to play and updates playtime; the wishlist adds wished games as Want to play in the Steam wishlist collection.">
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

// ── Trilium ──────────────────────────────────────────────────────────────────

// Only the config note's statuses are kept; it also holds a Steam key, which stays on this page.
function statuses_of(config: string): string {
  try {
    const parsed = JSON.parse(config) as { statuses?: unknown };
    return parsed.statuses ? JSON.stringify({ statuses: parsed.statuses }) : "";
  } catch {
    return "";
  }
}

function TriliumSettings() {
  const database_file = useRef<HTMLInputElement>(null);
  const config_file = useRef<HTMLInputElement>(null);
  const [statuses, set_statuses] = useState("");

  async function pick_config(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const text = await read_picked(event);
    if (text === null) return;
    const kept = statuses_of(text);
    if (!kept) toast("That file has no statuses; pick the Game Tracker's config.json note.", { tone: "bad" });
    set_statuses(kept);
  }

  async function import_database(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const text = await read_picked(event);
    if (text === null) return;
    try {
      const report = await calls().import_trilium_games(text, statuses);
      toast(`Imported ${report.added} new game(s) and merged ${report.updated} already here. Refresh in Games fills in details.`, { tone: "good" });
    } catch (error) {
      toast(`Could not import: ${(error as Error).message}`, { tone: "bad" });
    }
  }

  return (
    <>
      <SettingRow label="Trilium statuses" hint={`Optional: the add-on's config.json note, so statuses you added there, such as Endless, keep their meaning. ${statuses ? "Statuses are loaded." : "None loaded."}`}>
        <input ref={config_file} type="file" accept="application/json,.json" hidden aria-label="Trilium Game Tracker config file" onChange={(event) => void pick_config(event)} />
        <button type="button" onClick={() => config_file.current?.click()}>
          Pick config…
        </button>
      </SettingRow>
      <SettingRow label="Import from Trilium" hint="The Game Tracker add-on's Database note, saved as a .json file; new games are added and ones already here gain its playtime, rating and collections.">
        <input ref={database_file} type="file" accept="application/json,.json" hidden aria-label="Trilium Game Tracker Database file" onChange={(event) => void import_database(event)} />
        <button type="button" onClick={() => database_file.current?.click()}>
          Import Trilium…
        </button>
      </SettingRow>
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
    { id: "new-games", heading: "New games", content: <NewGameSettings {...props} /> },
    { id: "game-collections", heading: "Game collections", hint: "Your own shelves, such as Couch co-op or Backlog 2027; a game can be in several.", content: <CollectionSettings /> },
    { id: "steam", heading: "Steam", content: <SteamSettings {...props} /> },
    { id: "trilium-games", heading: "Trilium Game Tracker", content: <TriliumSettings /> },
    { id: "igdb", heading: "IGDB", hint: "IGDB's API needs a Twitch developer account, so your IGDB lists come in through its data export.", content: <IgdbSettings /> },
  ];
}
