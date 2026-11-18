// The Steam client's library categories, which its Web API does not give: the client keeps them in
// userdata/<account>/config/cloudstorage/cloud-storage-namespace-1.json, a list of [key, entry] pairs where each
// category's entry holds its name and the app ids added to it as JSON text. Read with no DOM and no files.

// ── Imports ──────────────────────────────────────────────────────────────────

import { parse_steam_id } from "./steam.ts";

// ── Shapes ───────────────────────────────────────────────────────────────────

export interface SteamCategory {
  name: string;
  app_ids: string[];
}

type Json = Record<string, unknown>;

// ── Reading ──────────────────────────────────────────────────────────────────

function parse(raw: string): unknown {
  try {
    return raw.trim() ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Categories by their name, A-Z; deleted ones and ones Steam fills by a filter, which list no games, are left out.
export function read_steam_categories(raw: string): SteamCategory[] {
  const entries = parse(raw);
  if (!Array.isArray(entries)) return [];
  const categories: SteamCategory[] = [];
  for (const pair of entries) {
    const [key, entry] = Array.isArray(pair) ? (pair as [unknown, Json | null]) : [];
    if (typeof key !== "string" || !key.startsWith("user-collections.") || !entry || entry.is_deleted) continue;
    const value = parse(typeof entry.value === "string" ? entry.value : "") as Json | null;
    const name = typeof value?.name === "string" ? value.name.trim() : "";
    if (!name || !Array.isArray(value?.added)) continue;
    categories.push({ name, app_ids: [...new Set(value.added.map(String).filter((id) => /^\d+$/.test(id)))] });
  }
  return categories.sort((first, second) => first.name.localeCompare(second.name));
}

// ── Finding the file ─────────────────────────────────────────────────────────

// Steam numbers an account's userdata folder by its 32-bit id, the 64-bit id less this.
const steam_id_base = 76561197960265728n;

// The folder of the profile set, by its 64-bit id or a link to it; "" for a custom URL name, which only Steam can turn into an id.
export function steam_account_folder(profile: string): string {
  const steam_id = parse_steam_id(profile);
  return steam_id ? String(BigInt(steam_id) - steam_id_base) : "";
}

export const steam_categories_file = ["config", "cloudstorage", "cloud-storage-namespace-1.json"];
