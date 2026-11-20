// The stores' dialogs below their plugin settings: importing Steam's library and wishlist and mapping its categories to
// statuses, importing itch.io's library, and signing in to the Epic Games Store and importing its library.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useRef, useState, type ChangeEvent } from "react";
import { Section, SettingRow } from "@x-tech-laboratories/x-libs/web/react/layout";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";

import { calls, page } from "../api.ts";
import type { FeatureSettingsProps } from "../features.tsx";
import { read_picked } from "../files.ts";
import { plugin_value } from "../plugins.tsx";
import { epic_sign_in_link } from "../../shared/games/epic.ts";
import { epic_manifest } from "../../shared/games/manifests.ts";
import { is_game_status, type GameStatus, type GameStatusInfo } from "../../shared/games/model.ts";
import type { SteamCategoryReport } from "../../shared/games/store.ts";
import { attempt } from "./actions.tsx";
import { StatusSelect, WithStatuses } from "./StatusPicker.tsx";

// ── Steam ────────────────────────────────────────────────────────────────────

export function SteamPanel(props: FeatureSettingsProps) {
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

  return (
    <>
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
      <Section title="Categories" level={3}>
        <p className="source-hint">Give each category of your Steam library a status; its tracked games take that status whenever the categories are read, the furthest along winning for a game in several.</p>
        <SteamCategories {...props} />
      </Section>
    </>
  );
}

function report_categories(report: SteamCategoryReport): void {
  const untracked = report.untracked ? `; ${report.untracked} in a mapped category are not tracked yet, so import the library first` : "";
  toast(`Read ${report.categories} Steam categories and changed the status of ${report.updated} game(s)${untracked}.`, { tone: "good" });
}

// Each category last read from Steam, and any mapped since, with the status its games take.
function SteamCategories({ settings }: FeatureSettingsProps) {
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

// ── itch.io ──────────────────────────────────────────────────────────────────

export function ItchioPanel() {
  const [busy, set_busy] = useState(false);

  const run = () => {
    set_busy(true);
    const work = calls()
      .import_itchio_library()
      .then((report) => toast(`Imported ${report.added} new game(s) and updated ${report.updated} from itch.io. Refresh in Games fills in details for new ones.`, { tone: "good" }));
    attempt(work.finally(() => set_busy(false)));
  };

  return (
    <SettingRow label="Import now" hint="Adds owned games as Backlog, owned on PC or Android; a game already here gains its itch.io page. itch.io gives no playtime.">
      <button type="button" disabled={busy} onClick={run}>
        {busy ? "Importing…" : "Import library"}
      </button>
    </SettingRow>
  );
}

// ── Epic Games Store ─────────────────────────────────────────────────────────

export function EpicPanel({ settings }: FeatureSettingsProps) {
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

  const client_id = String(plugin_value(settings, epic_manifest, "client_id")).trim();
  const signed_in = String(settings["games.epic_refresh_token"] ?? "") !== "";
  const account = String(settings["games.epic_account"] ?? "");
  return (
    <>
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
      <SettingRow label="Import now" hint="Adds owned games as Backlog, owned on PC; a game already here gains its Epic id. DLC and add-ons are left out, and Epic gives no playtime.">
        <button type="button" disabled={busy || !signed_in} onClick={run}>
          {busy ? "Importing…" : "Import library"}
        </button>
      </SettingRow>
    </>
  );
}
