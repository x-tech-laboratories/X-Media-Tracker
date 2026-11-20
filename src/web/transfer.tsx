// The Import and export rows of each section's settings and of General: a section as JSON or as a zip of CSV files, read
// back with each item the file says otherwise of settled in the merge window, and the settings as JSON.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useRef, useState, type ChangeEvent } from "react";
import { today } from "@x-tech-laboratories/x-libs/dates";
import { Switch } from "@x-tech-laboratories/x-libs/web/react/controls";
import { SettingRow, type SettingsSection } from "@x-tech-laboratories/x-libs/web/react/layout";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";
import { plural } from "@x-tech-laboratories/x-libs/web/format";
import { is_zip, unzip_text_files, zip_text_files } from "@x-tech-laboratories/x-libs/zip";

import { calls } from "./api.ts";
import { save_file, save_text, take_picked } from "./files.ts";
import { settle_imported, type MergeKind, type Tracked } from "./merging.tsx";
import type { TransferInput, TransferReport } from "../shared/transfer.ts";

// ── Files ────────────────────────────────────────────────────────────────────

// One JSON export, or CSV files picked together or in a zip, by their names.
export async function transfer_input(files: File[]): Promise<TransferInput> {
  if (files.length === 1 && /\.json$/i.test(files[0]!.name)) return { json: await files[0]!.text() };
  const csv: Record<string, string> = {};
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (is_zip(bytes)) Object.assign(csv, Object.fromEntries(Object.entries(unzip_text_files(bytes)).filter(([name]) => /\.csv$/i.test(name))));
    else if (/\.json$/i.test(file.name)) throw new Error("Pick a JSON export on its own.");
    else csv[file.name] = new TextDecoder().decode(bytes);
  }
  return { csv };
}

export function report_text(report: TransferReport, noun: string): string {
  const parts = [`Added ${plural(report.added, noun)}`, `updated ${report.updated}`, `${report.unchanged} unchanged`];
  const settle = report.conflicts.length > 0 ? ` ${plural(report.conflicts.length, noun)} differ from the file; settle each in turn.` : "";
  return `${parts.join(", ")}.${settle}`;
}

// ── Sections ─────────────────────────────────────────────────────────────────

export interface TransferSpec<Item extends Tracked> {
  // Such as "movies", in the files' names.
  name: string;
  // Such as "title", in what the import reports.
  noun: string;
  // What the files hold, for the section's hint.
  holds: string;
  export_json: () => Promise<unknown>;
  export_csv: () => Promise<Record<string, string>>;
  import_file: (input: TransferInput) => Promise<TransferReport>;
  // The merge window's kind and the tracked items, read after the import.
  merging: () => Promise<{ kind: MergeKind<Item>; items: Item[] }>;
}

function TransferRows<Item extends Tracked>({ spec }: { spec: TransferSpec<Item> }) {
  const picker = useRef<HTMLInputElement>(null);
  const [busy, set_busy] = useState(false);
  const file_name = (extension: string) => `x-media-tracker-${spec.name}-${today()}.${extension}`;

  async function run(work: () => Promise<void>): Promise<void> {
    set_busy(true);
    try {
      await work();
    } catch (error) {
      toast((error as Error).message, { tone: "bad" });
    } finally {
      set_busy(false);
    }
  }

  const export_json = () => run(async () => save_text(file_name("json"), JSON.stringify(await spec.export_json(), null, 2)));
  const export_csv = () => run(async () => save_file(file_name("zip"), new Blob([zip_text_files(await spec.export_csv()) as Uint8Array<ArrayBuffer>], { type: "application/zip" })));

  async function import_files(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = take_picked(event);
    if (files.length === 0) return;
    await run(async () => {
      const report = await spec.import_file(await transfer_input(files));
      toast(report_text(report, spec.noun), { tone: "good" });
      if (report.conflicts.length === 0) return;
      const { kind, items } = await spec.merging();
      settle_imported(kind, report.conflicts, items);
    });
  }

  return (
    <>
      <SettingRow label="Export" hint="JSON keeps everything in one file; CSV gives a zip with one spreadsheet per table.">
        <button type="button" disabled={busy} onClick={() => void export_json()}>
          Export JSON
        </button>
        <button type="button" disabled={busy} onClick={() => void export_csv()}>
          Export CSV
        </button>
      </SettingRow>
      <SettingRow label="Import" hint={`A JSON export, a CSV zip, or its CSV files picked together. Nothing is removed: new ${spec.noun}s are added, and where the file says otherwise of one already here you pick what it keeps.`}>
        <input ref={picker} type="file" multiple accept=".json,.zip,.csv,application/json,application/zip,text/csv" hidden aria-label={`${spec.name} export file`} onChange={(event) => void import_files(event)} />
        <button type="button" disabled={busy} onClick={() => picker.current?.click()}>
          Import…
        </button>
      </SettingRow>
    </>
  );
}

export function transfer_section<Item extends Tracked>(spec: TransferSpec<Item>): SettingsSection {
  return { id: `${spec.name}-files`, heading: "Import and export", hint: spec.holds, content: <TransferRows spec={spec} /> };
}

// ── Settings ─────────────────────────────────────────────────────────────────

function SettingsTransfer() {
  const picker = useRef<HTMLInputElement>(null);
  const [with_secrets, set_with_secrets] = useState(false);

  async function export_settings(): Promise<void> {
    try {
      save_text(`x-media-tracker-settings-${today()}.json`, JSON.stringify(await calls().export_settings(with_secrets), null, 2));
    } catch (error) {
      toast((error as Error).message, { tone: "bad" });
    }
  }

  async function import_settings(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const [file] = take_picked(event);
    if (!file) return;
    try {
      const report = await calls().import_settings(await file.text());
      toast(`Changed ${plural(report.changed, "setting")}; ${report.unchanged} already matched.`, { tone: "good" });
    } catch (error) {
      toast((error as Error).message, { tone: "bad" });
    }
  }

  return (
    <>
      <SettingRow label="Export settings" hint={with_secrets ? "The file holds your keys and tokens for other services; keep it private." : "Keys and tokens for other services, such as TMDB's, are left out."}>
        <Switch label="Include keys and tokens" show_label checked={with_secrets} on_change={set_with_secrets} />
        <button type="button" onClick={() => void export_settings()}>
          Export JSON
        </button>
      </SettingRow>
      <SettingRow label="Import settings" hint="A settings export; every setting it holds is set, and any it leaves out, such as keys and tokens, keeps its value.">
        <input ref={picker} type="file" accept=".json,application/json" hidden aria-label="Settings export file" onChange={(event) => void import_settings(event)} />
        <button type="button" onClick={() => picker.current?.click()}>
          Import…
        </button>
      </SettingRow>
    </>
  );
}

export function settings_transfer_section(): SettingsSection {
  return { id: "settings-files", heading: "Import and export", hint: "Every setting, by its key, as one JSON file to keep or to carry to another server or device.", content: <SettingsTransfer /> };
}
