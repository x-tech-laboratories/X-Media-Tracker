// The desktop's plugins folder for the page: the list of web entries, as a server's /api/plugins/index.json gives it,
// and each plugin's own files, never one outside its subfolder.

// ── Imports ──────────────────────────────────────────────────────────────────

import { existsSync, readFileSync } from "node:fs";

import { inside, plugin_entries } from "@x-tech-laboratories/x-libs/plugin_folder";

// ── Files ────────────────────────────────────────────────────────────────────

export function read_plugin_file(folder: string, path: string): string {
  if (path === "index.json") {
    const { entries, problems } = plugin_entries(folder, "web");
    return JSON.stringify({ entries: entries.map((entry) => `${encodeURIComponent(entry.name)}/${entry.path.split("/").map(encodeURIComponent).join("/")}`), problems });
  }
  const [name = "", ...rest] = path.split("/").map(decodeURIComponent);
  const root = name && !name.startsWith(".") ? inside(folder, name) : undefined;
  const file = root && inside(root, rest.join("/"));
  return file && existsSync(file) ? readFileSync(file, "utf8") : "";
}
