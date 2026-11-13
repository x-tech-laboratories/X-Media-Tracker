// The web server: the page, every data call the page makes, and the sync every device runs against, all on one database.

// ── Imports ──────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";

import fastify, { type FastifyInstance } from "fastify";
import { openapi_document, positional_args } from "@x-tech-laboratories/x-libs/api_spec";
import { EventStream } from "@x-tech-laboratories/x-libs/server/events";
import { register_mcp_route } from "@x-tech-laboratories/x-libs/server/mcp";
import { register_error_replies, register_lenient_json_body, send_text } from "@x-tech-laboratories/x-libs/server/replies";
import { register_accounts } from "@x-tech-laboratories/x-libs/server/account_sign_in";
import { AccountStore } from "@x-tech-laboratories/x-libs/server/account_store";
import type { Accounts } from "@x-tech-laboratories/x-libs/server/passwords";
import { backup_method_names, type BackupMethods } from "@x-tech-laboratories/x-libs/backup_protocol";
import { register_sync_routes } from "@x-tech-laboratories/x-libs/server/sync_routes";
import { register_web_folder } from "@x-tech-laboratories/x-libs/server/web_folder";
import type { SqlDatabase } from "@x-tech-laboratories/x-libs/sql";

import { media_bridge } from "../shared/bridge.ts";
import { library_secret_settings } from "../shared/library/settings.ts";
import { bind_methods, media_api, is_read_only, sync_engine, type MediaMethods } from "../shared/store.ts";

// ── Options ──────────────────────────────────────────────────────────────────

export interface AppOptions {
  database: SqlDatabase;
  // The users from the accounts file, who are admins; others are added on the Users page.
  declared: Accounts;
  web_folder: string;
  // The database's backups, which an admin manages from the page; one is taken before a device's data replaces it.
  backups: BackupMethods;
}

// ── Other programs ───────────────────────────────────────────────────────────

const version = (JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string }).version;

const instructions = [
  "X-Media-Tracker holds one person's library of movies and TV shows: what they plan to watch, are watching, watched or dropped, their ratings, watched episodes and collections.",
  "Days are local dates such as 2026-11-10; ratings are 1 to 10; a title's id is its strongest id, such as tmdb:693134.",
  "list_library is the place to start; search_tmdb and add_title add new titles.",
].join(" ");

// Settings that hold another service's key, which stay on the server and in the page's own settings.
const secret_settings = library_secret_settings;

function without_secrets(method: string, result: unknown): unknown {
  if (method !== "get_settings") return result;
  return Object.fromEntries(Object.entries(result as Record<string, unknown>).filter(([key]) => !secret_settings.includes(key)));
}

// ── App ──────────────────────────────────────────────────────────────────────

// An import, such as the Trilium Media Tracker's library, arrives as one call's argument.
const import_body_limit = 32 * 1024 * 1024;

export async function build_app(options: AppOptions): Promise<FastifyInstance> {
  const app = fastify({ forceCloseConnections: true });
  register_lenient_json_body(app);
  register_error_replies(app);
  const accounts = new AccountStore({ database: options.database, app_name: "X-Media-Tracker", declared: options.declared, token_prefix: "xf" });
  // Backups reach the whole database, the accounts included, so only an admin may manage them.
  await register_accounts(app, { accounts, cookie_name: "x_media_tracker_session", read_only_paths: ["/api/mcp"], needed: (_method, path) => (path.startsWith("/api/backup/") ? { role: accounts.top_role } : "any") });

  const changes = new EventStream();
  const database = () => options.database;

  await app.register(
    async (api) => {
      changes.register(api, "/events");

      // Calls arrive as POST /api/call/<method> with the arguments as a JSON list, or by name as a JSON object.
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
        const methods = bind_methods(database, () => changes.announce_change(changes.client_id_of(request)));
        const result = await media_bridge.dispatch(methods, request.params.method, args);
        if (result === undefined) return reply.code(204).send();
        return is_read_only(request.params.method) ? reply.header("cache-control", "no-store").send(result) : reply.send(result);
      });

      api.get("/openapi.json", async () =>
        openapi_document(media_api, { title: "X-Media-Tracker", version, description: instructions, path_of: (method) => `/api/call/${method}`, is_read_only }),
      );

      // A change made through MCP is announced to every page, since no page made it.
      await register_mcp_route(api, {
        name: "x-media-tracker",
        version,
        instructions,
        api: media_api,
        is_read_only,
        call: async (method, args) => {
          const methods = bind_methods(database, () => changes.announce_change());
          return without_secrets(method, await media_bridge.dispatch(methods, method, args));
        },
      });

      // Backup calls arrive as POST /api/backup/<method> with the arguments as a JSON list.
      api.post<{ Params: { method: string } }>("/backup/:method", async (request, reply) => {
        const method = request.params.method as keyof BackupMethods;
        if (!(backup_method_names as readonly string[]).includes(method)) return send_text(reply, 404, `no backup call named ${method}`);
        const args = Array.isArray(request.body) ? (request.body as unknown[]) : [];
        const result: unknown = await (options.backups[method] as (...args: unknown[]) => unknown)(...args);
        return result === undefined ? reply.code(204).send() : reply.header("cache-control", "no-store").send(result);
      });
      register_sync_routes(api, {
        engine: sync_engine,
        database,
        back_up: async () => void (await options.backups.create_backup()),
        on_change: (request) => changes.announce_change(changes.client_id_of(request)),
      });
    },
    { prefix: "/api" },
  );

  await register_web_folder(app, { folder: options.web_folder });
  return app;
}
