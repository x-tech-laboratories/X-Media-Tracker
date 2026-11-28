// Finds the Steam client's library categories on this computer, for Steam's own files are the only place they are kept.

// ── Imports ──────────────────────────────────────────────────────────────────

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { steam_account_folder, steam_categories_file } from "../shared/games/steam_collections.ts";

// ── Finding ──────────────────────────────────────────────────────────────────

// Where Steam keeps its data on Linux, also as a Flatpak or a Snap, on macOS and on Windows.
function steam_folders(): string[] {
  const home = homedir();
  return [
    join(home, ".local", "share", "Steam"),
    join(home, ".steam", "steam"),
    join(home, ".var", "app", "com.valvesoftware.Steam", ".local", "share", "Steam"),
    join(home, "snap", "steam", "common", ".local", "share", "Steam"),
    join(home, "Library", "Application Support", "Steam"),
    join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Steam"),
  ];
}

// The categories file of the account with the Steam id given, else the one changed last; "" when Steam is not here.
export function read_local_steam_categories(steam_id: string): string {
  const account = steam_account_folder(steam_id);
  const files = steam_folders().flatMap((folder) => {
    const userdata = join(folder, "userdata");
    if (!existsSync(userdata)) return [];
    return readdirSync(userdata)
      .filter((each) => !account || each === account)
      .map((each) => join(userdata, each, ...steam_categories_file))
      .filter((file) => existsSync(file));
  });
  const newest = files.sort((first, second) => statSync(second).mtimeMs - statSync(first).mtimeMs)[0];
  return newest ? readFileSync(newest, "utf8") : "";
}
