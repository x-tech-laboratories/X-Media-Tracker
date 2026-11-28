import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance, InjectOptions } from "fastify";

import { hidden_secret } from "@x-tech-laboratories/x-libs/plugins";
import { hash_password } from "@x-tech-laboratories/x-libs/server/passwords";
import { folder_file_store } from "@x-tech-laboratories/x-libs/node_file_store";
import { create_sync_peer } from "@x-tech-laboratories/x-libs/sync_peer";
import { file_sync_storage } from "@x-tech-laboratories/x-libs/sync_file_storage";
import { put_file } from "@x-tech-laboratories/x-libs/sync_files";

import { build_app } from "../src/server/app.ts";
import { referenced_covers } from "../src/shared/covers.ts";
import { method_names, open_store, sync_engine } from "../src/shared/store.ts";

let app: FastifyInstance;
// The token every request but the sign-in tests carries.
let token = "";
const password = "a long enough password";

afterEach(async () => {
  await app?.close();
});

// Sends one MCP request as a client speaking the 2025 protocol would, and gives back its result.
async function mcp(method: string, params: unknown = {}): Promise<Record<string, unknown>> {
  const reply = await signed({
    method: "POST",
    url: "/api/mcp",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" },
    payload: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const data = /^data: (.+)$/m.exec(reply.body)?.[1] ?? reply.body;
  return (JSON.parse(data) as { result: Record<string, unknown> }).result;
}

const taken = { name: "media-2026-11-10T09-30-00Z.db", taken_at: "2026-11-10T09:30:00Z", is_automatic: false, size_bytes: 4096 };
const fake_backups = {
  list_backups: vi.fn(async () => [taken]),
  create_backup: vi.fn(async () => taken),
  restore_backup: vi.fn(async () => undefined),
  remove_backup: vi.fn(async () => undefined),
  get_backup_schedule: vi.fn(() => ({ automatic: true, to_keep: 14 })),
  set_backup_schedule: vi.fn(),
};

let covers: ReturnType<typeof folder_file_store>;

async function start(web_folder = "/nonexistent"): Promise<FastifyInstance> {
  const database = new DatabaseSync(":memory:");
  open_store(database);
  const folder = mkdtempSync(join(tmpdir(), "x-media-tracker-server-"));
  covers = folder_file_store(join(folder, "covers"));
  app = await build_app({
    database,
    declared: new Map([["root", hash_password(password)]]),
    web_folder,
    backups: fake_backups,
    covers,
    auto_import: false,
    release_checks: false,
    sync_peer: (on_remote_change) =>
      create_sync_peer({
        app: "x-media-tracker",
        engine: sync_engine,
        database: () => database,
        storage: file_sync_storage({ file: join(folder, "sync-peers.json"), back_up_before_replace: vi.fn() }),
        files: { store: covers, referenced: referenced_covers },
        device_name: "X-Media-Tracker test server",
        addresses: () => ["https://media.example.org/api/"],
        on_remote_change,
      }),
  });
  token = (await app.inject({ method: "POST", url: "/api/login", payload: { name: "root", password, device: "tests" } })).json().token;
  return app;
}

// A request as the signed-in tests device.
function signed(options: InjectOptions) {
  return app.inject({ ...options, headers: { ...options.headers, authorization: `Bearer ${token}` } });
}

describe("server", () => {
  it("refuses API calls until signed in, but serves the page", async () => {
    await start();
    expect((await app.inject({ method: "POST", url: "/api/call/get_settings", payload: [] })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/api/mcp", payload: {} })).statusCode).toBe(401);
    expect((await signed({ method: "POST", url: "/api/call/get_settings", payload: [] })).statusCode).toBe(200);
  });

  it("serves the built page beside the API", async () => {
    const folder = mkdtempSync(join(tmpdir(), "x-media-tracker-web-"));
    writeFileSync(join(folder, "index.html"), "<title>X-Media-Tracker</title>");
    await start(folder);
    expect((await signed({ method: "GET", url: "/" })).body).toContain("X-Media-Tracker");
    expect((await signed({ method: "GET", url: "/api/missing" })).statusCode).toBe(404);
  });

  it("answers the page's calls by name with JSON arguments", async () => {
    await start();
    const write = await signed({ method: "POST", url: "/api/call/set_setting", payload: ["library.poster_size", "w185"] });
    expect(write.statusCode).toBe(204);
    const read = await signed({ method: "POST", url: "/api/call/get_settings", payload: [] });
    expect(read.json()).toMatchObject({ "library.poster_size": "w185", "library.default_status": "planned" });
  });

  it("takes a call whose argument is a large import file", async () => {
    await start();
    const big = JSON.stringify({ log: "x".repeat(3 * 1024 * 1024) });
    const reply = await signed({ method: "POST", url: "/api/call/set_setting", payload: ["import.test", big] });
    expect(reply.statusCode).toBe(204);
  });

  it("takes the arguments by name as a JSON object too", async () => {
    await start();
    const write = await signed({ method: "POST", url: "/api/call/set_setting", payload: { value: "w500", key: "library.poster_size" } });
    expect(write.statusCode).toBe(204);
    expect((await signed({ method: "POST", url: "/api/call/get_settings", payload: {} })).json()).toMatchObject({ "library.poster_size": "w500" });
  });

  it("refuses arguments it cannot place and calls it does not know", async () => {
    await start();
    const unknown_name = await signed({ method: "POST", url: "/api/call/get_settings", payload: { not: "an argument" } });
    expect(unknown_name.statusCode).toBe(400);
    expect(unknown_name.body).toBe("unknown argument not");
    expect((await signed({ method: "POST", url: "/api/call/set_setting", payload: { key: "library.poster_size" } })).statusCode).toBe(400);
    expect((await signed({ method: "POST", url: "/api/call/drop_everything", payload: [] })).statusCode).toBeGreaterThanOrEqual(400);
  });

  it("describes every call in an OpenAPI document", async () => {
    await start();
    const document = (await signed({ method: "GET", url: "/api/openapi.json" })).json() as { paths: Record<string, { post: { operationId: string; tags: string[] } }> };
    expect(document.paths["/api/call/list_library"]!.post).toMatchObject({ operationId: "list_library", tags: ["read"] });
    expect(document.paths["/api/call/set_title_status"]!.post.tags).toEqual(["change"]);
    expect(Object.keys(document.paths)).toHaveLength(method_names.length);
  });

  it("serves every call as an MCP tool, keeping other services' keys out of what it reads", async () => {
    await start();
    const listed = await mcp("tools/list");
    const tools = listed.tools as { name: string; annotations: { readOnlyHint: boolean } }[];
    expect(tools.map((tool) => tool.name).sort()).toEqual([...method_names].sort());
    expect(tools.find((tool) => tool.name === "list_library")!.annotations.readOnlyHint).toBe(true);
    expect(tools.find((tool) => tool.name === "set_title_status")!.annotations.readOnlyHint).toBe(false);

    const saved = await mcp("tools/call", { name: "save_collection", arguments: { collection: { name: "Comfort", group_id: null } } });
    const collection_id = (saved.content as { text: string }[])[0]!.text;
    const library = await mcp("tools/call", { name: "list_library", arguments: {} });
    expect(JSON.parse((library.content as { text: string }[])[0]!.text).collections).toContainEqual(expect.objectContaining({ id: collection_id, name: "Comfort" }));

    await signed({ method: "POST", url: "/api/call/set_setting", payload: ["library.tmdb_api_key", "not-a-real-key"] });
    await signed({ method: "POST", url: "/api/call/set_setting", payload: ["plugins", { "x-media-tracker.tmdb": { settings: { api_key: "not-a-real-key" } } }] });
    await signed({ method: "POST", url: "/api/call/set_setting", payload: ["trakt.access_token", "not-a-real-token"] });
    const settings = await mcp("tools/call", { name: "get_settings", arguments: {} });
    const values = JSON.parse((settings.content as { text: string }[])[0]!.text) as Record<string, unknown>;
    expect(values).toHaveProperty("library.poster_size");
    expect(values["library.tmdb_api_key"]).toBe(hidden_secret);
    expect(JSON.stringify(values.plugins)).not.toContain("not-a-real-key");
    expect(values.plugins).toMatchObject({ "x-media-tracker.tmdb": { settings: { api_key: hidden_secret } } });
    expect(values["trakt.access_token"]).toBe(hidden_secret);
    expect(values).toHaveProperty("trakt.client_id");

    const exported = await mcp("tools/call", { name: "export_settings", arguments: { include_secrets: true } });
    const file = JSON.parse((exported.content as { text: string }[])[0]!.text) as { kind: string; settings: Record<string, unknown> };
    expect(file.kind).toBe("settings");
    expect(file.settings).not.toHaveProperty("library.tmdb_api_key");
  });

  it("answers other devices' sealed sync calls without a sign-in, and shows its pairings only to an admin", async () => {
    await start();

    const peer_call = await app.inject({ method: "POST", url: "/api/sync/peer", headers: { "content-type": "application/octet-stream" }, payload: Buffer.from("not sealed") });
    const signed_out = await app.inject({ method: "POST", url: "/api/device/create_pairing_code", payload: [] });
    const code = await signed({ method: "POST", url: "/api/device/create_pairing_code", payload: [] });

    expect(peer_call.statusCode).not.toBe(401);
    expect(signed_out.statusCode).toBe(401);
    expect(code.json()).toHaveProperty("code");
  });

  it("serves a kept cover by its name to a signed-in page or device, and nothing else", async () => {
    await start();
    const name = await put_file(covers, new Uint8Array([1, 2, 3]));

    const signed_out = await app.inject({ method: "GET", url: `/api/covers/${name}` });
    const kept = await signed({ method: "GET", url: `/api/covers/${name}` });
    const missing = await signed({ method: "GET", url: "/api/covers/not-a-cover" });

    expect(signed_out.statusCode).toBe(401);
    expect(kept.statusCode).toBe(200);
    expect([...kept.rawPayload]).toEqual([1, 2, 3]);
    expect(missing.statusCode).toBe(404);
  });

  it("lets an admin list and take the server's backups, and refuses unknown backup calls", async () => {
    await start();

    expect((await app.inject({ method: "POST", url: "/api/backup/list_backups", payload: [] })).statusCode).toBe(401);
    const listed = await signed({ method: "POST", url: "/api/backup/list_backups", payload: [] });
    expect(listed.json()).toEqual([taken]);
    expect((await signed({ method: "POST", url: "/api/backup/create_backup", payload: [] })).json()).toEqual(taken);
    expect(fake_backups.create_backup).toHaveBeenCalled();
    expect((await signed({ method: "POST", url: "/api/backup/drop_everything", payload: [] })).statusCode).toBe(404);
  });
});
