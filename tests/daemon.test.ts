import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { call_daemon, follow_daemon_events, is_answering } from "@x-tech-laboratories/x-libs/local_daemon";
import { folder_file_store } from "@x-tech-laboratories/x-libs/node_file_store";
import { put_file } from "@x-tech-laboratories/x-libs/sync_files";

import { start_media_daemon, type MediaDaemon, type MediaDaemonOptions } from "../src/daemon/daemon.ts";
import { read_desktop_settings } from "../src/shared/desktop.ts";
import { remote_file_url } from "../src/main/remote_files.ts";

// ============================================================================
// Helpers
// ============================================================================

let folder: string;
let socket_path: string;
const running: MediaDaemon[] = [];

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "x-media-tracker-daemon-"));
  socket_path = join(folder, "daemon.sock");
});

afterEach(async () => {
  for (const daemon of running.splice(0)) await daemon.shut_down();
  rmSync(folder, { recursive: true, force: true });
});

// A daemon on a throwaway database and socket, with no schedules reaching the network and a free port for other devices.
async function start(options: Partial<MediaDaemonOptions> = {}): Promise<MediaDaemon> {
  const daemon = await start_media_daemon({ database_path: join(folder, "media.db"), socket_path, on_stopped: () => undefined, schedules: false, default_peer_port: 0, ...options });
  running.push(daemon!);
  return daemon!;
}

async function until(check: () => boolean | Promise<boolean>): Promise<void> {
  for (let tries = 0; tries < 100 && !(await check()); tries++) await new Promise((resolve) => setTimeout(resolve, 50));
}

// A GET over the daemon's socket, as the window's cover scheme would make one.
function get_over_socket(path: string): Promise<{ status: number; bytes: number[] }> {
  return new Promise((resolve, reject) => {
    const sent = request({ socketPath: socket_path, path, method: "GET" }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode ?? 0, bytes: Array.from(Buffer.concat(chunks)) }));
    });
    sent.on("error", reject);
    sent.end();
  });
}

// ============================================================================
// Small pieces
// ============================================================================

describe("desktop settings", () => {
  it("fills in each default where a setting is missing or damaged", () => {
    expect(read_desktop_settings(null)).toEqual({ keep_running_in_background: true, start_at_login: true });
    expect(read_desktop_settings({ keep_running_in_background: false, start_at_login: 1 })).toEqual({ keep_running_in_background: false, start_at_login: true });
  });
});

describe("remote files", () => {
  it("addresses a file under a server's API, escaping each part of its path", () => {
    expect(remote_file_url("https://media.example.org/", "covers/abc.jpg")).toBe("https://media.example.org/api/covers/abc.jpg");
    expect(remote_file_url("https://media.example.org/sub", "plugins/my plugin/web.js")).toBe("https://media.example.org/sub/api/plugins/my%20plugin/web.js");
  });
});

// ============================================================================
// Daemon
// ============================================================================

describe("daemon", { timeout: 30_000 }, () => {
  it("answers the page's calls on its socket, as the server does", async () => {
    await start();

    await call_daemon(socket_path, "/api/call/save_collection_group", [{ name: "Mood" }]);

    expect(await call_daemon(socket_path, "/api/call/list_library", [])).toMatchObject({ groups: [expect.objectContaining({ name: "Mood" })] });
  });

  it("answers this computer's own tables: sync with backups, letting devices connect, Steam, launchers, plugins and its settings", async () => {
    await start();

    expect(await call_daemon(socket_path, "/api/device/get_sync_status", [])).toMatchObject({ state: "off", peers: [] });
    expect(await call_daemon(socket_path, "/api/device/list_backups", [])).toEqual(expect.any(Array));
    expect(await call_daemon(socket_path, "/api/peer_listening/get_peer_listening", [])).toMatchObject({ on: false });
    expect(typeof (await call_daemon(socket_path, "/api/steam_files/read_steam_categories", []))).toBe("string");
    expect(await call_daemon(socket_path, "/api/launchers/list_lutris_games", [])).toEqual(expect.any(Array));
    expect(await call_daemon(socket_path, "/api/plugin_files/read_plugin_file", ["index.json"])).toEqual(expect.any(String));
    await call_daemon(socket_path, "/api/daemon/set_desktop_setting", ["start_at_login", false]);
    expect(await call_daemon(socket_path, "/api/daemon/get_desktop_settings", [])).toEqual({ keep_running_in_background: true, start_at_login: false });
  });

  it("serves the covers kept beside its database by name", async () => {
    await start();
    const name = await put_file(folder_file_store(join(folder, "covers")), new Uint8Array([7, 8, 9]));

    expect(await get_over_socket(`/api/covers/${name}`)).toEqual({ status: 200, bytes: [7, 8, 9] });
    expect((await get_over_socket("/api/covers/missing")).status).toBe(404);
  });

  it("takes and restores a backup, telling the windows of the change", async () => {
    await start();
    const seen: string[] = [];
    const stop = follow_daemon_events(socket_path, "/api/events", (event) => seen.push(event));
    await until(() => seen.includes("hello"));

    const taken = (await call_daemon(socket_path, "/api/device/create_backup", [])) as { name: string };
    await call_daemon(socket_path, "/api/device/set_backup_schedule", [{ automatic: false, to_keep: 3 }]);
    await call_daemon(socket_path, "/api/device/restore_backup", [taken.name]);
    await until(() => seen.includes("changed"));
    stop();

    expect(await call_daemon(socket_path, "/api/device/get_backup_schedule", [])).toEqual({ automatic: false, to_keep: 3 });
    expect(seen).toContain("changed");
  });

  it("leaves a second daemon on the same database out, since the first already answers", async () => {
    await start();

    expect(await start_media_daemon({ database_path: join(folder, "media.db"), socket_path, on_stopped: () => undefined, schedules: false })).toBeNull();
  });

  it("runs its schedules, stops when asked, and only once", async () => {
    const on_stopped = vi.fn();
    const daemon = await start({ on_stopped, schedules: true });

    await call_daemon(socket_path, "/api/daemon/stop_daemon", []);
    await until(() => on_stopped.mock.calls.length > 0);
    await daemon.shut_down();

    expect(on_stopped).toHaveBeenCalledTimes(1);
    expect(await is_answering(socket_path)).toBe(false);
  });

  it("stops a while after its last window closed when it is not to keep running", async () => {
    const on_stopped = vi.fn();
    await start({ on_stopped, unused_exit_ms: 100, unused_check_ms: 20 });

    await call_daemon(socket_path, "/api/daemon/set_desktop_setting", ["keep_running_in_background", false]);
    await until(() => on_stopped.mock.calls.length > 0);

    expect(on_stopped).toHaveBeenCalledTimes(1);
  });

  it("runs as a program of its own, as the window starts it", async () => {
    const program = spawn(process.execPath, ["src/daemon/main.ts"], { env: { ...process.env, X_MEDIA_TRACKER_DB: join(folder, "media.db"), X_MEDIA_TRACKER_SOCKET: socket_path }, stdio: "ignore" });
    await until(() => is_answering(socket_path));

    await call_daemon(socket_path, "/api/daemon/stop_daemon", []);

    expect(await new Promise((resolve) => program.once("exit", resolve))).toBe(0);
  });
});
