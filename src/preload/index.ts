// Gives the desktop app's page its calls to the main process, under the names the page looks for.

// ── Imports ──────────────────────────────────────────────────────────────────

import { contextBridge, ipcRenderer } from "electron";

import { certificate_bridge, device_bridge, launchers_bridge, media_bridge, media_events, plugin_files_bridge, steam_files_bridge } from "../shared/bridge.ts";

// ── Bridge ───────────────────────────────────────────────────────────────────

media_bridge.expose(contextBridge, ipcRenderer, { envelopes: true });
device_bridge.expose(contextBridge, ipcRenderer, { envelopes: true });
certificate_bridge.expose(contextBridge, ipcRenderer, { envelopes: true });
steam_files_bridge.expose(contextBridge, ipcRenderer, { envelopes: true });
launchers_bridge.expose(contextBridge, ipcRenderer, { envelopes: true });
plugin_files_bridge.expose(contextBridge, ipcRenderer, { envelopes: true });
media_events.expose(contextBridge, ipcRenderer);
