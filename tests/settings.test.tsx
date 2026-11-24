// @vitest-environment jsdom
import "@x-tech-laboratories/x-libs/web/react/test_stubs";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Client } from "@x-tech-laboratories/x-libs/electron/bridge";
import { Dialogs } from "@x-tech-laboratories/x-libs/web/react/dialog";

import type { DeviceMethods } from "../src/shared/page_api.ts";
import { setting_defaults, type MediaMethods } from "../src/shared/store.ts";
import { set_page_api } from "../src/web/api.ts";
import { SettingsView } from "../src/web/settings/SettingsView.tsx";
import { forget_page_plugins } from "../src/web/plugins.tsx";

// A server with no plugins folder has no list of its plugins.
beforeEach(() => vi.stubGlobal("fetch", vi.fn(async () => new Response("not found", { status: 404 }))));

afterEach(() => {
  cleanup();
  forget_page_plugins();
  vi.unstubAllGlobals();
});

function fake_calls(saved: Record<string, unknown>): Client<MediaMethods> {
  return {
    get_settings: vi.fn(async () => ({ ...setting_defaults, ...saved })),
    list_library: vi.fn(async () => ({ titles: [], collections: [], groups: [] })),
    set_setting: vi.fn(async (key: string, value: unknown) => {
      saved[key] = value;
    }),
  } as unknown as Client<MediaMethods>;
}

const off = { state: "off", server_url: "", user: "", last_synced_at: "", pending_changes: 0, error: "" } as const;

describe("settings", () => {
  it("lists the server's folder plugins under Plugins, saying when there are none", async () => {
    set_page_api({ host: "web", calls: fake_calls({}), device: null, cover_src: async () => "", on_change: () => () => undefined });
    render(<SettingsView />);

    expect(await screen.findByText(/No plugins installed/)).toBeTruthy();
    expect(screen.getByText(/plugins folder beside the server's database/)).toBeTruthy();
    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).toContainEqual(expect.stringContaining("api/plugins/index.json"));
  });

  it("shows the library's settings with their defaults and saves a change", async () => {
    const calls = fake_calls({ "library.poster_size": "w500" });
    set_page_api({ host: "web", calls, device: null, cover_src: async () => "", on_change: () => () => undefined });
    render(<SettingsView />);

    expect(((await screen.findByLabelText("Poster size")) as HTMLSelectElement).value).toBe("w500");
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Status for new titles" })).getByRole("radio", { name: "Watching" }));
    await waitFor(() => expect(calls.set_setting).toHaveBeenCalledWith("library.default_status", "watching"));

    const tmdb_row = screen.getByRole("button", { name: "Open TMDB" }).closest(".setting-row") as HTMLElement;
    expect(within(tmdb_row).getByText("No key")).toBeTruthy();
    fireEvent.click(within(tmdb_row).getByRole("button", { name: "Open TMDB" }));
    const dialog = screen.getByRole("dialog", { name: "TMDB" });
    const key = within(dialog).getByPlaceholderText("Paste your key") as HTMLInputElement;
    expect(key.type).toBe("password");
    fireEvent.change(key, { target: { value: "a-key" } });
    fireEvent.blur(key);
    await waitFor(() => expect(calls.set_setting).toHaveBeenCalledWith("plugins", expect.objectContaining({ "x-media-tracker.tmdb": expect.objectContaining({ settings: { api_key: "a-key" } }) })));
    expect(screen.queryByText("Sync")).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog", { name: "TMDB" })).toBeNull();
  });

  it("offers sync on a device and signs it in with the choice of copy", async () => {
    const device = {
      get_sync_status: vi.fn(async () => off),
      connect_sync: vi.fn(async () => ({ ...off, state: "idle", server_url: "https://media.example.org/" })),
      disconnect_sync: vi.fn(),
      sync_now: vi.fn(),
    } as unknown as Client<DeviceMethods>;
    set_page_api({ host: "desktop", calls: fake_calls({}), device, cover_src: async () => "", on_change: () => () => undefined });
    render(<><SettingsView /><Dialogs /></>);

    fireEvent.change(await screen.findByLabelText("Server address"), { target: { value: "https://media.example.org" } });
    fireEvent.change(screen.getByLabelText("User name"), { target: { value: "ada" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Use the server's media library" }));
    fireEvent.click(await screen.findByRole("button", { name: "Use the server's" }));
    await waitFor(() => expect(device.connect_sync).toHaveBeenCalledWith("https://media.example.org", { name: "ada", password: "secret" }, "download"));
  });

  it("shows the server's backups in a browser and takes one by hand", async () => {
    const taken = { name: "media-2026-11-10T09-30-00Z.db", taken_at: "2026-11-10T09:30:00Z", is_automatic: false, size_bytes: 4096 };
    const backups = {
      list_backups: vi.fn(async () => [taken]),
      create_backup: vi.fn(async () => taken),
      restore_backup: vi.fn(),
      remove_backup: vi.fn(),
      get_backup_schedule: vi.fn(async () => ({ automatic: true, to_keep: 14 })),
      set_backup_schedule: vi.fn(),
    };
    set_page_api({ host: "web", calls: fake_calls({}), device: null, backups, cover_src: async () => "", on_change: () => () => undefined });
    render(<><SettingsView /><Dialogs /></>);

    expect((await screen.findAllByText("Server")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("Backups")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Sync")).toBeNull();
    await waitFor(() => expect(backups.list_backups).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole("button", { name: "Back up" }));
    await waitFor(() => expect(backups.create_backup).toHaveBeenCalled());
  });

  it("waits for a phone to pick its backup folder, then reads the backups in it", async () => {
    const backups = {
      list_backups: vi.fn(async () => []),
      create_backup: vi.fn(),
      restore_backup: vi.fn(),
      remove_backup: vi.fn(),
      get_backup_schedule: vi.fn(async () => ({ automatic: true, to_keep: 14 })),
      set_backup_schedule: vi.fn(),
    };
    const backup_folder = { get: vi.fn(async () => ""), choose: vi.fn(async () => "Documents") };
    const device = { get_sync_status: vi.fn(async () => off) } as unknown as Client<DeviceMethods>;
    set_page_api({ host: "android", calls: fake_calls({}), device, backups, backup_folder, cover_src: async () => "", on_change: () => () => undefined });
    render(<><SettingsView /><Dialogs /></>);

    expect(await screen.findByRole("button", { name: "Back up" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "Choose" }));
    expect(await screen.findByRole("button", { name: "Change" })).toBeTruthy();
    expect(screen.getByText("Documents")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back up" })).toHaveProperty("disabled", false);
    await waitFor(() => expect(backups.list_backups).toHaveBeenCalledTimes(2));
  });
});
