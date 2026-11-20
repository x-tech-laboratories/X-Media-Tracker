// IGDB's data export taken in from its plugin's dialog in Settings: its lists as statuses and collections, with ratings and reviews.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useRef, type ChangeEvent } from "react";
import { SettingRow } from "@x-tech-laboratories/x-libs/web/react/layout";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";

import { calls } from "../api.ts";
import { read_picked } from "../files.ts";

// ── Import ───────────────────────────────────────────────────────────────────

export function IgdbImport() {
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
