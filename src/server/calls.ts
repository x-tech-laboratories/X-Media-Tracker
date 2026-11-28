// The page's data calls and kept covers as routes, the same on the web server and on the desktop app's daemon.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { FastifyInstance, FastifyRequest } from "fastify";
import { positional_args } from "@x-tech-laboratories/x-libs/api_spec";
import { send_text } from "@x-tech-laboratories/x-libs/server/replies";
import type { SqlDatabase } from "@x-tech-laboratories/x-libs/sql";
import { is_file_name, type SyncFileStore } from "@x-tech-laboratories/x-libs/sync_files";

import { media_bridge } from "../shared/bridge.ts";
import { bind_methods, media_api, is_read_only, type MediaMethods } from "../shared/store.ts";

// ── Calls ────────────────────────────────────────────────────────────────────

// An import, such as a StoryGraph export, arrives as one call's argument.
const import_body_limit = 32 * 1024 * 1024;

// POST /call/<method> with the arguments as a JSON list, or by name as a JSON object; a write runs announce with the
// request, so every page and window but the one that made it hears of it.
export function register_media_calls(api: FastifyInstance, database: () => SqlDatabase, announce: (request: FastifyRequest) => void): void {
  api.post<{ Params: { method: string } }>("/call/:method", { bodyLimit: import_body_limit }, async (request, reply) => {
    const body: unknown = request.body ?? [];
    const spec = media_api[request.params.method as keyof MediaMethods];
    let args: unknown[];
    if (Array.isArray(body)) args = body;
    else if (spec && typeof body === "object" && body !== null) {
      try {
        args = positional_args(spec, body as Record<string, unknown>);
      } catch (error) {
        return send_text(reply, 400, (error as Error).message);
      }
    } else return send_text(reply, 400, "send the arguments as a JSON list or object");
    const methods = bind_methods(database, () => announce(request));
    const result = await media_bridge.dispatch(methods, request.params.method, args);
    if (result === undefined) return reply.code(204).send();
    // Always JSON, since Fastify sends a bare string such as a new id as plain text a caller cannot parse.
    reply.type("application/json");
    if (is_read_only(request.params.method)) reply.header("cache-control", "no-store");
    return reply.send(JSON.stringify(result));
  });
}

// ── Covers ───────────────────────────────────────────────────────────────────

// GET /covers/<name>: a kept cover by its file's name, which names its content, so it may be cached for good.
export function register_cover_files(api: FastifyInstance, covers: SyncFileStore): void {
  api.get<{ Params: { name: string } }>("/covers/:name", async (request, reply) => {
    const { name } = request.params;
    const bytes = is_file_name(name) ? await covers.read(name) : undefined;
    if (!bytes) return send_text(reply, 404, "no such cover");
    return reply.header("cache-control", "public, max-age=31536000, immutable").type("application/octet-stream").send(Buffer.from(bytes));
  });
}
