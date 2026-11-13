// The Stremio calls described for other programs: what each does and the arguments it takes.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { MethodSpec } from "@x-tech-laboratories/x-libs/api_spec";

import { text } from "../../api_schemas.ts";

// ── Calls ────────────────────────────────────────────────────────────────────

export const stremio_api = {
  get_stremio_status: {
    description: "Says whether the library is signed in to Stremio, and as which email.",
    params: [],
  },
  sign_in_stremio: {
    description: "Signs in to Stremio for an auth key; the password is used once and kept nowhere.",
    params: [
      { name: "email", schema: text("The Stremio account's email.") },
      { name: "password", schema: text("Its password.") },
    ],
  },
  sign_out_stremio: {
    description: "Forgets the Stremio sign-in.",
    params: [],
  },
  import_stremio: {
    description: "Imports the Stremio library: watched movies, and each show's episodes up to the one last played. Adds and merges, never removes, and writes nothing to Stremio.",
    params: [],
  },
} satisfies Record<string, MethodSpec>;
