// The web server: the page, every data call the page makes, and the server's own sync peer, all on one database.

// ── Imports ──────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";

import fastify, { type FastifyInstance } from "fastify";
import { openapi_document } from "@x-tech-laboratories/x-libs/api_spec";
import { EventStream } from "@x-tech-laboratories/x-libs/server/events";
import { register_mcp_route } from "@x-tech-laboratories/x-libs/server/mcp";
import { register_error_replies, register_lenient_json_body, send_text } from "@x-tech-laboratories/x-libs/server/replies";
import { register_accounts } from "@x-tech-laboratories/x-libs/server/account_sign_in";
import { AccountStore } from "@x-tech-laboratories/x-libs/server/account_store";
import type { Accounts } from "@x-tech-laboratories/x-libs/server/passwords";
import { backup_method_names, type BackupMethods } from "@x-tech-laboratories/x-libs/backup_protocol";
import { register_call_table } from "@x-tech-laboratories/x-libs/server/call_table";
import { register_sync_peer_routes } from "@x-tech-laboratories/x-libs/server/sync_peer_routes";
import { sync_device_methods, type SyncPeer } from "@x-tech-laboratories/x-libs/sync_peer";
import { register_web_folder } from "@x-tech-laboratories/x-libs/server/web_folder";
import { register_plugin_files } from "@x-tech-laboratories/x-libs/server/plugin_files";
import type { SqlDatabase } from "@x-tech-laboratories/x-libs/sql";
import type { SyncFileStore } from "@x-tech-laboratories/x-libs/sync_files";

import { media_bridge } from "../shared/bridge.ts";
import { keep_fetching_covers, type KeepFetchingCovers } from "../shared/covers.ts";
import { send_book_alerts } from "./book_alerts.ts";
import { keep_checking_releases } from "../shared/books/schedule.ts";
import { keep_importing } from "../shared/sources/schedule.ts";
import { bind_methods, media_api, is_read_only } from "../shared/store.ts";
import { register_cover_files, register_media_calls } from "./calls.ts";

// ── Options ──────────────────────────────────────────────────────────────────

export interface AppOptions {
  database: SqlDatabase;
  // The users from the accounts file, who are admins; others are added on the Users page.
  declared: Accounts;
  web_folder: string;
  // The database's backups, which an admin manages from the page; one is taken before a device's data replaces it.
  backups: BackupMethods;
  // Whether the sources set to import automatically, and the Steam import, run on their schedule; on unless false.
  auto_import?: boolean;
  // Whether new books by the authors and series followed are looked for and alerted on their schedule; on unless false.
  release_checks?: boolean;
  // The plugins folder, whose page sides the page loads from /api/plugins/; none are served without it.
  plugins_folder?: string;
  // Where the covers kept on every device are stored; the server downloads them, serves them to its pages and syncs them.
  covers?: SyncFileStore;
  // Makes the server's own sync peer, told how to announce what other devices changed; no sync without it.
  sync_peer?: (on_remote_change: () => void) => SyncPeer;
}

// ── Other programs ───────────────────────────────────────────────────────────

const version = (JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string }).version;

const instructions = [
  "X-Media-Tracker holds one person's library of movies and TV shows: what they plan to watch, are watching, watched or dropped, their ratings, watched episodes and collections.",
  "Days are local dates such as 2026-11-10; ratings are 1 to 10; a title's id is its strongest id, such as tmdb:693134.",
  "list_library is the place to start; search_tmdb and add_title add new titles.",
].join(" ");


// ── App ──────────────────────────────────────────────────────────────────────

const admin_paths = ["/api/backup/", "/api/sync/"];

export async function build_app(options: AppOptions): Promise<FastifyInstance> {
  const app = fastify({ forceCloseConnections: true });
  register_lenient_json_body(app);
  register_error_replies(app);
  const accounts = new AccountStore({ database: options.database, app_name: "X-Media-Tracker", declared: options.declared, token_prefix: "xf" });
  // Backups reach the whole database, the accounts included, and the server's pairings decide who syncs, so only an admin
  // may manage them; each peer call is sealed between the two devices, so it needs no sign-in.
  await register_accounts(app, { accounts, cookie_name: "x_media_tracker_session", read_only_paths: ["/api/mcp"], open_paths: ["/api/sync/peer"], needed: (_method, path) => (admin_paths.some((admin_path) => path.startsWith(admin_path)) ? { role: accounts.top_role } : "any") });

  const changes = new EventStream();
  const database = () => options.database;
  const covers: KeepFetchingCovers | undefined = options.covers && keep_fetching_covers({ database, store: options.covers, on_change: () => changes.announce_change() });
  if (covers) app.addHook("onClose", async () => covers.stop());
  // A write may have changed a cover's address, so the covers are looked at again soon after.
  const announce = (client_id?: string): void => {
    changes.announce_change(client_id);
    covers?.soon();
  };
  const sync = options.sync_peer?.(() => announce());
  if (sync) {
    sync.start();
    app.addHook("onClose", async () => sync.stop());
  }

  await app.register(
    async (api) => {
      changes.register(api, "/events");

      register_media_calls(api, database, (request) => announce(changes.client_id_of(request)));
      if (options.covers) register_cover_files(api, options.covers);

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
          const methods = bind_methods(database, () => announce());
          // Keys and tokens for other services never leave through MCP.
          return media_bridge.dispatch(methods, method, method === "export_settings" ? [false] : args);
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
      if (options.plugins_folder) register_plugin_files(api, { folder: options.plugins_folder, prefix: "/plugins", side: "web" });
      if (sync) {
        register_sync_peer_routes(api, sync);
        register_call_table(api, "/sync", sync_device_methods(sync), { is_read_only });
      }
    },
    { prefix: "/api" },
  );

  if (options.auto_import !== false) {
    const stop_importing = keep_importing(
      () => bind_methods(database, () => undefined),
      () => announce(),
    );
    app.addHook("onClose", async () => stop_importing());
  }

  if (options.release_checks !== false) {
    const methods = () => bind_methods(database, () => undefined);
    const stop_checking = keep_checking_releases(methods, () => announce(), () => send_book_alerts(methods()));
    app.addHook("onClose", async () => stop_checking());
  }

  await register_web_folder(app, { folder: options.web_folder });
  return app;
}
