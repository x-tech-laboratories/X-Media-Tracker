// Links that open a title in Stremio: in the installed app, or in Stremio Web. Stremio knows titles only by IMDb id.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { MediaType } from "../../library/model.ts";

// ── Links ────────────────────────────────────────────────────────────────────

export interface StremioLinks {
  app: string;
  web: string;
}

// The app's own scheme, which the desktop window lets out to the installed app.
export const stremio_scheme = "stremio:";

// Null when the title has no IMDb id to find it by.
export function stremio_links(media_type: MediaType, imdb_id: string): StremioLinks | null {
  if (!/^tt\d+$/i.test(imdb_id)) return null;
  const path = `detail/${media_type === "show" ? "series" : "movie"}/${imdb_id.toLowerCase()}`;
  return { app: `${stremio_scheme}///${path}`, web: `https://web.stremio.com/#/${path}` };
}
