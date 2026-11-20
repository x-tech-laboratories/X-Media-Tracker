// Links that start a game in a launcher installed on this computer: Steam, Heroic, the Epic Games launcher, GOG Galaxy
// or Lutris, each by the id that launcher knows the game by. The page imports this file too, so it imports only types.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { Game, GameLaunchIds } from "./model.ts";

// ── Launchers ────────────────────────────────────────────────────────────────

export const launchers = ["steam", "heroic", "epic", "gog_galaxy", "lutris"] as const;

export type Launcher = (typeof launchers)[number];

export const launcher_labels: Record<Launcher, string> = {
  steam: "Steam",
  heroic: "Heroic",
  epic: "Epic Games launcher",
  gog_galaxy: "GOG Galaxy",
  lutris: "Lutris",
};

// Each launcher's own scheme, which the desktop window lets out to the installed launcher.
export const launcher_schemes = ["steam:", "heroic:", "com.epicgames.launcher:", "goggalaxy:", "lutris:"];

export function is_launcher(value: unknown): value is Launcher {
  return typeof value === "string" && (launchers as readonly string[]).includes(value);
}

// A stored list as launchers in their usual order, dropping any no longer known.
export function clean_launchers(value: unknown): Launcher[] {
  const chosen = new Set(Array.isArray(value) ? value.filter(is_launcher) : []);
  return launchers.filter((launcher) => chosen.has(launcher));
}

// ── Links ────────────────────────────────────────────────────────────────────

export interface LaunchLink {
  launcher: Launcher;
  label: string;
  href: string;
}

type LaunchGame = Pick<Game, "steam_app_id" | "epic_id"> & GameLaunchIds;

function link_for(launcher: Launcher, game: LaunchGame): string {
  const epic = game.epic_app_name;
  const gog = game.gog_product_id;
  switch (launcher) {
    case "steam":
      return /^\d+$/.test(game.steam_app_id) ? `steam://rungameid/${game.steam_app_id}` : "";
    case "heroic":
      if (epic) return `heroic://launch?${new URLSearchParams({ appName: epic, runner: "legendary" }).toString()}`;
      return gog ? `heroic://launch?${new URLSearchParams({ appName: gog, runner: "gog" }).toString()}` : "";
    case "epic":
      if (!epic || !game.epic_namespace || !game.epic_id) return "";
      return `com.epicgames.launcher://apps/${[game.epic_namespace, game.epic_id, epic].map(encodeURIComponent).join("%3A")}?action=launch&silent=true`;
    case "gog_galaxy":
      return /^\d+$/.test(gog) ? `goggalaxy://openGameView/${gog}` : "";
    case "lutris":
      return game.lutris_slug ? `lutris:rungame/${encodeURIComponent(game.lutris_slug)}` : "";
  }
}

// The links for the launchers chosen in Settings that know the game, in their usual order.
export function launch_links(game: LaunchGame, chosen: readonly Launcher[]): LaunchLink[] {
  return clean_launchers(chosen).flatMap((launcher) => {
    const href = link_for(launcher, game);
    return href ? [{ launcher, label: `${launcher === "gog_galaxy" ? "Open" : "Launch"} in ${launcher_labels[launcher]}`, href }] : [];
  });
}

// ── Lutris ───────────────────────────────────────────────────────────────────

// A game installed in Lutris, with the store it came from and that store's id, such as "steam" and "620".
export interface LutrisGame {
  slug: string;
  name: string;
  service: string;
  service_id: string;
}

function plain_name(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

// The game's slug in Lutris: the one set, else an installed game from the same store's id, else one of the same name.
export function lutris_slug_of(game: Pick<Game, "steam_app_id" | "title"> & GameLaunchIds, installed: readonly LutrisGame[]): string {
  if (game.lutris_slug) return game.lutris_slug;
  const store_ids: Record<string, string> = { steam: game.steam_app_id, gog: game.gog_product_id, egs: game.epic_app_name };
  const by_store = installed.find((each) => !!store_ids[each.service] && store_ids[each.service] === each.service_id);
  return (by_store ?? installed.find((each) => plain_name(each.name) === plain_name(game.title)))?.slug ?? "";
}
