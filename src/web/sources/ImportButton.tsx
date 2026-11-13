// A button that runs one import and says what it did.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useState } from "react";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";

import type { ImportReport } from "../../shared/library/store.ts";

// ── Button ───────────────────────────────────────────────────────────────────

export function ImportButton({ label, run }: { label: string; run: () => Promise<ImportReport> }) {
  const [busy, set_busy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        set_busy(true);
        run()
          .then((report) => toast(`Imported ${report.added} new title(s) and updated ${report.updated}.`, { tone: "good" }))
          .catch((error: unknown) => toast((error as Error).message, { tone: "bad" }))
          .finally(() => set_busy(false));
      }}
    >
      {busy ? "Importing…" : label}
    </button>
  );
}
