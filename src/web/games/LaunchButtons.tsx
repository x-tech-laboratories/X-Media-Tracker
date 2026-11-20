// A game's buttons that start it in the launchers turned on in Settings: Steam, Heroic, the Epic Games launcher, GOG Galaxy
// or Lutris. Left out on a phone, where none of them runs.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";

import { page, use_settings } from "../api.ts";
import { clean_launchers, launch_links, lutris_slug_of, type LutrisGame } from "../../shared/games/launch.ts";
import type { LibraryGame } from "../../shared/games/model.ts";

// ── Lutris ───────────────────────────────────────────────────────────────────

// The games installed in Lutris on this computer, asked once for every page; none outside the desktop app.
let lutris_games: Promise<LutrisGame[]> | undefined;

function use_lutris_games(): LutrisGame[] {
  const [games, set_games] = useState<LutrisGame[]>([]);
  useEffect(() => {
    const { launchers } = page();
    if (!launchers) return;
    lutris_games ??= launchers.list_lutris_games().catch(() => []);
    let current = true;
    void lutris_games.then((found) => current && set_games(found));
    return () => {
      current = false;
    };
  }, []);
  return games;
}

// ── Buttons ──────────────────────────────────────────────────────────────────

export function LaunchButtons({ game }: { game: LibraryGame }) {
  const settings = use_settings();
  const installed = use_lutris_games();
  if (page().host === "android" || !settings.data) return null;
  const chosen = clean_launchers(settings.data["games.launchers"]);
  const links = launch_links({ ...game, lutris_slug: lutris_slug_of(game, installed) }, chosen);
  return (
    <>
      {links.map((link) => (
        <a key={link.launcher} className="button" href={link.href}>
          {link.label}
        </a>
      ))}
    </>
  );
}
