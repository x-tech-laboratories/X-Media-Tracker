// The covers the page shows: the one kept on this device when there is one, else the catalogue's address.

// ── Imports ──────────────────────────────────────────────────────────────────

import { cover_source } from "@x-tech-laboratories/x-libs/web/react/media";
import { use_resource } from "@x-tech-laboratories/x-libs/web/react/states";

import { data_watch, page } from "./api.ts";

// ── Hooks ────────────────────────────────────────────────────────────────────

// Undefined while the kept file is looked up, and looked up again whenever the data changed, as when sync brought it.
export function use_cover(file: string, address: string): string | null | undefined {
  const found = use_resource(async () => (file ? (await page().cover_src(file)) || address : address) || null, [file, address], { watch: data_watch });
  return cover_source(found);
}

// ── Views ────────────────────────────────────────────────────────────────────

// The large poster at the head of a title's, book's or game's page.
export function HeadPoster({ file, address }: { file: string; address: string }) {
  const src = use_cover(file, address);
  return src ? <img className="title-poster" src={src} alt="" /> : null;
}
