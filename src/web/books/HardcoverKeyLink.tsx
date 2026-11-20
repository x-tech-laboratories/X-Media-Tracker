// The link in Hardcover's dialog that opens Hardcover's form for a key that can read books and nothing of the account.

// ── Imports ──────────────────────────────────────────────────────────────────

import { SettingRow } from "@x-tech-laboratories/x-libs/web/react/layout";

import { hardcover_key_link } from "../../shared/books/hardcover.ts";

// ── Link ─────────────────────────────────────────────────────────────────────

export function HardcoverKeyLink() {
  return (
    <SettingRow label="Make a Hardcover key" hint="Opens Hardcover's form with read:catalog ticked, so the key can read books but nothing of your account.">
      <a href={hardcover_key_link} target="_blank" rel="noreferrer">
        Open Hardcover
      </a>
    </SettingRow>
  );
}
