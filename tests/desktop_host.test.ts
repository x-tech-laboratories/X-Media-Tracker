// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  backups_api_name,
  certificates_api_name,
  connections_api_name,
  cover_scheme,
  desktop_api_name,
  device_api_name,
  events_api_name,
  launchers_api_name,
  media_api_name,
  peer_listening_api_name,
  plugin_files_api_name,
  steam_files_api_name,
} from "../src/shared/page_api.ts";
import { desktop_api, is_desktop } from "../src/web/hosts/desktop.ts";

// ============================================================================
// Helpers
// ============================================================================

const window_keys: string[] = [];

afterEach(() => {
  for (const key of window_keys.splice(0)) delete (window as unknown as Record<string, unknown>)[key];
});

// Puts what the preload would expose on the window, the connections answering with the daemon in use.
function expose(current: string): { changed: () => void } {
  let listener = (): void => {};
  const exposed: Record<string, unknown> = {
    [media_api_name]: { list_library: vi.fn() },
    [device_api_name]: { get_sync_status: vi.fn() },
    [peer_listening_api_name]: { get_peer_listening: vi.fn() },
    [backups_api_name]: { list_backups: vi.fn() },
    [certificates_api_name]: { list_trusted: vi.fn() },
    [steam_files_api_name]: { read_steam_categories: vi.fn() },
    [launchers_api_name]: { list_lutris_games: vi.fn() },
    [plugin_files_api_name]: { read_plugin_file: vi.fn() },
    [desktop_api_name]: { get_desktop_settings: vi.fn() },
    [connections_api_name]: { list_connections: vi.fn(async () => ({ connections: [], current })) },
    [events_api_name]: { on: (_event: string, given: () => void) => ((listener = given), () => undefined) },
  };
  Object.assign(window, exposed);
  window_keys.push(...Object.keys(exposed));
  return { changed: () => listener() };
}

// ============================================================================
// Desktop
// ============================================================================

describe("desktop host", () => {
  it("is the desktop only where the preload put its calls", () => {
    expect(is_desktop()).toBe(false);
    expose("local");
    expect(is_desktop()).toBe(true);
  });

  it("offers this computer's sync and listening while its own daemon is in use, and covers through its scheme", async () => {
    expose("local");

    const api = await desktop_api();

    expect(api.host).toBe("desktop");
    expect(api.device).not.toBeNull();
    expect(api.peer_listening).toBeDefined();
    expect(api.steam_files).toBeDefined();
    expect(api.launchers).toBeDefined();
    expect(await api.cover_src("abc.jpg")).toBe(`${cover_scheme}://abc.jpg`);
  });

  it("leaves device sync out on a server's daemon, keeps this computer's Steam and launchers, and passes changes on", async () => {
    const { changed } = expose("home-server");
    const listener = vi.fn();

    const api = await desktop_api();
    api.on_change(listener);
    changed();

    expect(api.device).toBeNull();
    expect(api.peer_listening).toBeUndefined();
    expect(api.steam_files).toBeDefined();
    expect(listener).toHaveBeenCalledOnce();
  });
});
