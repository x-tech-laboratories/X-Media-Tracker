// Starts the desktop app's daemon on the database and socket the window names, and ends the process once it stops.

// ── Imports ──────────────────────────────────────────────────────────────────

import { daemon_socket_path } from "@x-tech-laboratories/x-libs/local_daemon";

import { start_media_daemon } from "./daemon.ts";

// ── Start ────────────────────────────────────────────────────────────────────

// The window starts it with these set; a run on another database has a socket of its own.
const database_path = process.env.X_MEDIA_TRACKER_DB;
if (!database_path) {
  console.error("x-media-tracker daemon: X_MEDIA_TRACKER_DB must name the database");
  process.exit(2);
}
const socket_path = process.env.X_MEDIA_TRACKER_SOCKET || daemon_socket_path({ app: "x-media-tracker", data_file: database_path });

try {
  const daemon = await start_media_daemon({ database_path, socket_path, on_stopped: () => process.exit(0) });
  // Another daemon on this database got there first, which is all that was asked for.
  if (!daemon) process.exit(0);
  console.log(`x-media-tracker daemon on ${socket_path}, using ${database_path}`);
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => void daemon.shut_down());
} catch (error) {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
}
