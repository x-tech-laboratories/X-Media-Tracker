import { describe, expect, it } from "vitest";

import { clean_launchers, launch_links, launchers, lutris_slug_of, type LutrisGame } from "../src/shared/games/launch.ts";

const unknown = { steam_app_id: "", epic_id: "", epic_namespace: "", epic_app_name: "", gog_product_id: "", lutris_slug: "", title: "Portal 2" };

describe("launch links", () => {
  it("starts a Steam game by its app id", () => {
    expect(launch_links({ ...unknown, steam_app_id: "620" }, launchers)).toEqual([{ launcher: "steam", label: "Launch in Steam", href: "steam://rungameid/620" }]);
  });

  it("starts an Epic game in Heroic and the Epic launcher, and a GOG game in Heroic and Galaxy", () => {
    const epic = { ...unknown, epic_id: "c4763f236d08423eb47b4c3008779c84", epic_namespace: "ns1", epic_app_name: "Quail" };
    expect(launch_links(epic, launchers).map((link) => link.href)).toEqual([
      "heroic://launch?appName=Quail&runner=legendary",
      "com.epicgames.launcher://apps/ns1%3Ac4763f236d08423eb47b4c3008779c84%3AQuail?action=launch&silent=true",
    ]);
    expect(launch_links({ ...unknown, gog_product_id: "1207664663" }, launchers).map((link) => [link.label, link.href])).toEqual([
      ["Launch in Heroic", "heroic://launch?appName=1207664663&runner=gog"],
      ["Open in GOG Galaxy", "goggalaxy://openGameView/1207664663"],
    ]);
  });

  it("offers only the launchers chosen, in their usual order", () => {
    const game = { ...unknown, steam_app_id: "620", lutris_slug: "portal-2" };
    expect(launch_links(game, ["lutris", "steam"]).map((link) => link.href)).toEqual(["steam://rungameid/620", "lutris:rungame/portal-2"]);
    expect(launch_links(game, [])).toEqual([]);
    expect(clean_launchers(["lutris", "nope", "steam", 3])).toEqual(["steam", "lutris"]);
    expect(clean_launchers(null)).toEqual([]);
  });

  it("finds a game installed in Lutris by its store's id, else by its title", () => {
    const installed: LutrisGame[] = [
      { slug: "portal-2-steam", name: "Portal 2 (Steam)", service: "steam", service_id: "620" },
      { slug: "portal-2", name: "Portal 2", service: "", service_id: "" },
      { slug: "witcher-3", name: "The Witcher 3", service: "gog", service_id: "1207664663" },
    ];
    expect(lutris_slug_of({ ...unknown, steam_app_id: "620" }, installed)).toBe("portal-2-steam");
    expect(lutris_slug_of({ ...unknown, title: "PORTAL 2!" }, installed)).toBe("portal-2");
    expect(lutris_slug_of({ ...unknown, title: "Other", gog_product_id: "1207664663" }, installed)).toBe("witcher-3");
    expect(lutris_slug_of({ ...unknown, title: "Other", lutris_slug: "mine" }, installed)).toBe("mine");
    expect(lutris_slug_of({ ...unknown, title: "Other" }, installed)).toBe("");
  });
});
