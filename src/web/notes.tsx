// Your own notes on a movie, show, book or game, in rich text, saved when the box loses focus.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useState } from "react";
import { Section } from "@x-tech-laboratories/x-libs/web/react/layout";
import { RichText } from "@x-tech-laboratories/x-libs/web/react/rich_text";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";

// ── Views ────────────────────────────────────────────────────────────────────

// Give it the item's id as its key, so another item's page starts from that item's notes.
export function NotesBox({ notes, save }: { notes: string; save: (notes: string) => Promise<unknown> }) {
  const [text, set_text] = useState(notes);
  const store = () => {
    if (text.trim() === notes) return;
    save(text).catch((error: unknown) => toast((error as Error).message, { tone: "bad" }));
  };
  return (
    <Section title="Notes">
      <RichText label="Notes" placeholder="Anything to remember about it" value={text} on_change={set_text} on_blur={store} />
    </Section>
  );
}
