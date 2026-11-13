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

// Stremio's own web instance, used when the setting is empty or not a web address.
export const default_stremio_web = "https://web.stremio.com";

// The Stremio Web instance as an address without a trailing slash, such as a self-hosted "https://stremio.example.org".
export function stremio_web_base(address: string): string {
  try {
    const url = new URL(address.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return default_stremio_web;
    return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
  } catch {
    return default_stremio_web;
  }
}

// Null when the title has no IMDb id to find it by.
export function stremio_links(media_type: MediaType, imdb_id: string, web_address = default_stremio_web): StremioLinks | null {
  if (!/^tt\d+$/i.test(imdb_id)) return null;
  const path = `detail/${media_type === "show" ? "series" : "movie"}/${imdb_id.toLowerCase()}`;
  return { app: `${stremio_scheme}///${path}`, web: `${stremio_web_base(web_address)}/#/${path}` };
}
