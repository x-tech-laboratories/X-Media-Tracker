// The Stremio panel on the Import page: signing in with the account's email and password, and importing.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useState } from "react";
import { FormRow, Section } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Loaded } from "@x-tech-laboratories/x-libs/web/react/states";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";

import { calls, use_data } from "../api.ts";
import { ImportButton } from "./ImportButton.tsx";

// ── Panel ────────────────────────────────────────────────────────────────────

function SignInForm() {
  const [email, set_email] = useState("");
  const [password, set_password] = useState("");
  const [busy, set_busy] = useState(false);
  return (
    <form
      className="source-form"
      onSubmit={(event) => {
        event.preventDefault();
        set_busy(true);
        calls()
          .sign_in_stremio(email, password)
          .then(() => toast("Signed in to Stremio.", { tone: "good" }))
          .catch((error: unknown) => toast((error as Error).message, { tone: "bad" }))
          .finally(() => {
            set_password("");
            set_busy(false);
          });
      }}
    >
      <FormRow label="Email" id="stremio-email">
        <input id="stremio-email" type="email" autoComplete="off" value={email} onChange={(event) => set_email(event.currentTarget.value)} />
      </FormRow>
      <FormRow label="Password" id="stremio-password" hint="Sent once to Stremio for a key; it is kept nowhere.">
        <input id="stremio-password" type="password" autoComplete="off" value={password} onChange={(event) => set_password(event.currentTarget.value)} />
      </FormRow>
      <button type="submit" disabled={busy || !email || !password}>
        {busy ? "Signing in…" : "Sign in to Stremio"}
      </button>
    </form>
  );
}

export function StremioPanel() {
  const status = use_data((api) => api.get_stremio_status());
  return (
    <Section title="Stremio">
      <p className="source-hint">Stremio keeps only where each show is up to, so a show's episodes up to the one last played count as watched. Nothing is written to Stremio.</p>
      <Loaded resource={status}>
        {(loaded) =>
          loaded.signed_in ? (
            <div className="source-actions">
              <span>Signed in as {loaded.email || "your Stremio account"}.</span>
              <ImportButton label="Import from Stremio" run={() => calls().run_source_import("stremio")} />
              <button type="button" onClick={() => void calls().sign_out_stremio()}>
                Sign out of Stremio
              </button>
            </div>
          ) : (
            <SignInForm />
          )
        }
      </Loaded>
    </Section>
  );
}
