// The Trakt panel on the Import page: the user's own Trakt app, signing in by a code entered on Trakt's site, importing,
// archiving everything before leaving Trakt, and Trakt's history beside the library, one watch at a time.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { Badge } from "@x-tech-laboratories/x-libs/web/react/badges";
import { confirm_dialog } from "@x-tech-laboratories/x-libs/web/react/dialog";
import { FormRow, Section } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Loaded } from "@x-tech-laboratories/x-libs/web/react/states";
import { DataTable, type TableColumn } from "@x-tech-laboratories/x-libs/web/react/table";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";

import { calls, use_data } from "../api.ts";
import { save_text } from "../files.ts";
import type { DeviceCode } from "../../shared/sources/trakt/client.ts";
import type { ArchiveReport, ComparedRow, Comparison, TraktStatus } from "../../shared/sources/trakt/store.ts";
import { ImportButton } from "./ImportButton.tsx";

// ── App ──────────────────────────────────────────────────────────────────────

function AppForm({ status }: { status: TraktStatus }) {
  const [client_id, set_client_id] = useState(status.client_id);
  const [client_secret, set_client_secret] = useState("");
  return (
    <form
      className="source-form"
      onSubmit={(event) => {
        event.preventDefault();
        calls()
          .set_trakt_app(client_id, client_secret)
          .then(() => {
            set_client_secret("");
            toast("Saved the Trakt app.", { tone: "good" });
          })
          .catch((error: unknown) => toast((error as Error).message, { tone: "bad" }));
      }}
    >
      <FormRow label="Client ID" id="trakt-client-id" hint="From your API app at trakt.tv/oauth/applications, with urn:ietf:wg:oauth:2.0:oob as its redirect address.">
        <input id="trakt-client-id" autoComplete="off" spellCheck={false} value={client_id} onChange={(event) => set_client_id(event.currentTarget.value)} />
      </FormRow>
      <FormRow label="Client Secret" id="trakt-client-secret" hint={status.has_client_secret ? "Set; leave blank to keep it." : "The secret from the same app."}>
        <input id="trakt-client-secret" type="password" autoComplete="off" spellCheck={false} value={client_secret} onChange={(event) => set_client_secret(event.currentTarget.value)} />
      </FormRow>
      <button type="submit">Save Trakt app</button>
    </form>
  );
}

// ── Signing in ───────────────────────────────────────────────────────────────

// Shows the code to enter on Trakt's site and asks Trakt every few seconds whether it has been entered.
function SignIn() {
  const [code, set_code] = useState<DeviceCode | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const poll = (device: DeviceCode, wait_seconds: number, ends_at: number) => {
    timer.current = setTimeout(() => {
      if (Date.now() > ends_at) {
        set_code(null);
        toast("The Trakt code ran out. Start again.", { tone: "warn" });
        return;
      }
      calls()
        .poll_trakt_sign_in(device.device_code)
        .then(({ state }) => {
          if (state === "authorized") {
            set_code(null);
            toast("Signed in to Trakt.", { tone: "good" });
          } else poll(device, state === "slow_down" ? wait_seconds + 1 : wait_seconds, ends_at);
        })
        .catch((error: unknown) => {
          set_code(null);
          toast((error as Error).message, { tone: "bad" });
        });
    }, wait_seconds * 1000);
  };

  const start = () =>
    calls()
      .start_trakt_sign_in()
      .then((device) => {
        set_code(device);
        poll(device, Math.max(1, device.interval), Date.now() + device.expires_in * 1000);
      })
      .catch((error: unknown) => toast((error as Error).message, { tone: "bad" }));

  if (!code)
    return (
      <button type="button" onClick={() => void start()}>
        Sign in to Trakt
      </button>
    );
  return (
    <p className="trakt-code">
      Enter <strong>{code.user_code}</strong> at{" "}
      <a href={code.verification_url} target="_blank" rel="noreferrer">
        {code.verification_url}
      </a>
      ; this page notices once you have.
    </p>
  );
}

// ── Archive ──────────────────────────────────────────────────────────────────

function report_archive(report: ArchiveReport): void {
  const lists = Object.entries(report.counts).map(([name, count]) => `${name.replaceAll("_", " ")}: ${count === null ? "failed" : count}`);
  const outcome = `Archived Trakt (${lists.join(", ")}); imported ${report.added} new and updated ${report.updated}; applied ${report.ratings_applied} rating(s).`;
  if (report.failures.length) toast(`${outcome} Some lists failed, so delete nothing from Trakt yet: ${report.failures.join("; ")}`, { tone: "warn" });
  else toast(outcome, { tone: "good" });
}

function Archives() {
  const archives = use_data((api) => api.list_trakt_archives());
  const [busy, set_busy] = useState(false);
  const archive = () => {
    set_busy(true);
    calls()
      .archive_trakt()
      .then(report_archive)
      .catch((error: unknown) => toast((error as Error).message, { tone: "bad" }))
      .finally(() => set_busy(false));
  };
  return (
    <>
      <p className="source-hint">
        Before leaving Trakt, archive everything: every list Trakt holds is kept as Trakt sent it, with each watch's time, your ratings, watchlist and collection. Check the counts, back up,
        then remove your data on Trakt's own site.
      </p>
      <button type="button" disabled={busy} onClick={archive}>
        {busy ? "Archiving…" : "Archive everything"}
      </button>
      <Loaded resource={archives}>
        {(list) =>
          list.length > 0 && (
            <ul className="archive-list">
              {list.map((each) => (
                <li key={each.id}>
                  <span>
                    {new Date(each.fetched_at).toLocaleString()}
                    {each.failures.length > 0 && <Badge tone="warn">{each.failures.length} failed</Badge>}
                  </span>
                  <button type="button" onClick={() => void calls().export_trakt_archive(each.id).then((text) => save_text(`trakt-archive-${each.fetched_at.slice(0, 10)}.json`, text))}>
                    Export
                  </button>
                </li>
              ))}
            </ul>
          )
        }
      </Loaded>
    </>
  );
}

// ── Comparison ───────────────────────────────────────────────────────────────

function Compare() {
  const [comparison, set_comparison] = useState<Comparison | null>(null);
  const [busy, set_busy] = useState(false);

  const load = () => {
    set_busy(true);
    calls()
      .lookup_trakt_history()
      .then(set_comparison)
      .catch((error: unknown) => toast((error as Error).message, { tone: "bad" }))
      .finally(() => set_busy(false));
  };

  const mark_captured = (row: ComparedRow) =>
    set_comparison((current) => current && { ...current, rows: current.rows.map((each) => (each === row ? { ...each, captured: true } : each)), captured: current.captured + 1, missing: current.missing - 1 });

  const import_row = (row: ComparedRow) =>
    calls()
      .import_trakt_watch(row)
      .then(() => mark_captured(row))
      .catch((error: unknown) => toast((error as Error).message, { tone: "bad" }));

  const remove_row = (row: ComparedRow) =>
    confirm_dialog({
      title: "Remove this watch from Trakt?",
      message: `${row.label}, watched ${row.watched_at.slice(0, 10)}. Trakt has no undo; the library keeps the watch.`,
      confirm_label: "Remove from Trakt",
      danger: true,
      run: async () => {
        await calls().remove_trakt_watch(row);
        set_comparison((current) => current && { ...current, rows: current.rows.filter((each) => each !== row), total: current.total - 1, captured: current.captured - 1 });
      },
    });

  const columns: TableColumn<ComparedRow>[] = [
    { label: "In the library", id: "captured", cell: (row) => (row.captured ? <Badge tone="good">✓</Badge> : <Badge tone="warn">!</Badge>), sort: (row) => (row.captured ? 1 : 0), width: 120 },
    { label: "Watch", id: "label", cell: (row) => row.label, sort: (row) => row.label },
    { label: "Watched", id: "watched_at", cell: (row) => row.watched_at.slice(0, 16).replace("T", " "), sort: (row) => row.watched_at, width: 170 },
    {
      label: "Action",
      id: "action",
      cell: (row) =>
        row.captured ? (
          <button type="button" className="danger" onClick={() => remove_row(row)}>
            Remove from Trakt
          </button>
        ) : (
          <button type="button" onClick={() => void import_row(row)}>
            Import
          </button>
        ),
      width: 180,
    },
  ];

  return (
    <>
      <p className="source-hint">Trakt's whole history beside the library, newest first: import a watch the library lacks, or remove one from Trakt once the library holds it.</p>
      <button type="button" disabled={busy} onClick={load}>
        {busy ? "Reading Trakt…" : comparison ? "Compare again" : "Compare with Trakt"}
      </button>
      {comparison && (
        <>
          <p>
            {comparison.total} watches: {comparison.captured} in the library, {comparison.missing} not yet.
          </p>
          <DataTable columns={columns} rows={comparison.rows} row_key={(row) => row.history_id} caption="Trakt history" virtual={{ row_height: 44 }} wrap_class="scroll sticky-head" />
        </>
      )}
    </>
  );
}

// ── Panel ────────────────────────────────────────────────────────────────────

export function TraktPanel() {
  const status = use_data((api) => api.get_trakt_status());
  return (
    <Section title="Trakt">
      <Loaded resource={status}>
        {(loaded) => (
          <>
            <AppForm status={loaded} />
            {loaded.client_id && !loaded.signed_in && <SignIn />}
            {loaded.signed_in && (
              <>
                <div className="source-actions">
                  <span>Signed in to Trakt.</span>
                  <ImportButton label="Import from Trakt" run={() => calls().run_source_import("trakt")} />
                  <button type="button" onClick={() => void calls().sign_out_trakt()}>
                    Sign out of Trakt
                  </button>
                </div>
                <Archives />
                <Compare />
              </>
            )}
          </>
        )}
      </Loaded>
    </Section>
  );
}
