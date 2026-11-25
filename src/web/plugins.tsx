// The page's side of the plugins: a row in Settings for each, whose dialog holds its on or off, its settings and its
// own panel, and the parts sources add elsewhere, such as Stremio's links on each title's page. On or off and each
// plugin's settings are the same synced records the store's side reads, so a plugin turned off here stops everywhere.

// ── Imports ──────────────────────────────────────────────────────────────────

import * as React from "react";
import { useEffect, useState, type ComponentType } from "react";
import * as jsx_runtime from "react/jsx-runtime";
import { create_plugin_host, define_plugin, type Plugin, type PluginHost, type PluginManifest, type PluginRecords } from "@x-tech-laboratories/x-libs/plugins";
import { bridge_fetch_text, load_plugin_modules, share_modules } from "@x-tech-laboratories/x-libs/web/plugin_imports";
import { SettingsDialogRow } from "@x-tech-laboratories/x-libs/web/react/dialog";
import { PluginSettings, PluginSlot, use_plugins } from "@x-tech-laboratories/x-libs/web/react/plugins";
import { Skeleton } from "@x-tech-laboratories/x-libs/web/react/states";

import { calls, page } from "./api.ts";
import { LibraryThingPanel, StoryGraphPanel } from "./books/FilePanels.tsx";
import { HardcoverKeyLink } from "./books/HardcoverKeyLink.tsx";
import type { FeatureSettingsProps } from "./features.tsx";
import { IgdbImport } from "./games/IgdbImport.tsx";
import { EpicPanel, ItchioPanel, SteamPanel } from "./games/StorePanels.tsx";
import { StremioPanel } from "./sources/StremioPanel.tsx";
import { StremioTitleLinks } from "./sources/StremioTitleLinks.tsx";
import { TraktPanel } from "./sources/TraktPanel.tsx";
import { book_catalog_manifests, book_file_manifests, hardcover_manifest, librarything_manifest, storygraph_manifest } from "../shared/books/manifests.ts";
import { epic_manifest, game_catalog_manifests, igdb_manifest, itchio_manifest, steam_manifest } from "../shared/games/manifests.ts";
import { title_catalog_manifests } from "../shared/library/manifests.ts";
import type { MediaType } from "../shared/library/model.ts";
import { desktop_plugin_base } from "../shared/page_api.ts";
import { app_info, plugins_setting } from "../shared/plugins/app.ts";
import { stremio_manifest, trakt_manifest } from "../shared/sources/manifests.ts";

// ── Api ──────────────────────────────────────────────────────────────────────

export interface PagePluginApi {
  slots: {
    // What the plugin's dialog in Settings shows below its settings, such as signing in and importing.
    panel: ComponentType<FeatureSettingsProps>;
    // Buttons beside a title's name; imdb_id is "" when neither the title nor TMDB has one.
    title_actions: ComponentType<{ media_type: MediaType; imdb_id: string }>;
  };
}

const trakt_page = define_plugin<PagePluginApi>({ ...trakt_manifest, start: (context) => context.fill_slot("panel", TraktPanel) });

const stremio_page = define_plugin<PagePluginApi>({
  ...stremio_manifest,
  start: (context) => {
    context.fill_slot("panel", StremioPanel);
    // The Web button follows the address in the plugin's settings, read again on each draw.
    context.fill_slot("title_actions", (props) => <StremioTitleLinks {...props} web_address={String(context.settings().web_address ?? "")} />);
  },
});

// What a dialog shows below the plugin's settings, by plugin id, such as IGDB's data export or Epic's sign-in.
const panels: Record<string, ComponentType<FeatureSettingsProps>> = {
  [igdb_manifest.id]: IgdbImport,
  [hardcover_manifest.id]: HardcoverKeyLink,
  [steam_manifest.id]: SteamPanel,
  [itchio_manifest.id]: ItchioPanel,
  [epic_manifest.id]: EpicPanel,
  [storygraph_manifest.id]: StoryGraphPanel,
  [librarything_manifest.id]: LibraryThingPanel,
};

// A catalogue's or store's page side has only its settings and, for some, a panel.
const catalog_pages = [...title_catalog_manifests, ...book_catalog_manifests, ...book_file_manifests, ...game_catalog_manifests, epic_manifest].map((manifest) =>
  define_plugin<PagePluginApi>({
    ...manifest,
    start: (context) => {
      const panel = panels[manifest.id];
      if (panel) context.fill_slot("panel", panel);
    },
  }),
);

const bundled_pages = [trakt_page, stremio_page, ...catalog_pages];

// ── Folder ───────────────────────────────────────────────────────────────────

// The web sides of the plugins folder: the server's in a browser, the profile's on the desktop, none on a phone.
async function folder_pages(): Promise<Plugin<PagePluginApi>[]> {
  const { host, plugin_files } = page();
  if (host === "android" || (host === "desktop" && !plugin_files)) return [];
  share_modules({ react: React, "react/jsx-runtime": jsx_runtime });
  try {
    const loaded =
      host === "desktop"
        ? await load_plugin_modules<PagePluginApi>(`${desktop_plugin_base}index.json`, bridge_fetch_text(desktop_plugin_base, (path) => plugin_files!.read_plugin_file(path)))
        : await load_plugin_modules<PagePluginApi>("api/plugins/index.json");
    for (const problem of loaded.problems) console.warn(`plugin ${problem.name}: ${problem.problem}`);
    return loaded.plugins;
  } catch (error) {
    console.warn("plugins folder:", error);
    return [];
  }
}

// ── Host ─────────────────────────────────────────────────────────────────────

let started: Promise<PluginHost<PagePluginApi>> | null = null;

// Started once, after sign-in, since its records come from the server.
export function start_page_plugins(): Promise<PluginHost<PagePluginApi>> {
  started ??= (async () => {
    const host = create_plugin_host<PagePluginApi>({
      app: app_info,
      storage: {
        read: async () => (await calls().get_settings())[plugins_setting] as PluginRecords | undefined,
        write: (records) => calls().set_setting(plugins_setting, records),
      },
      on_error: (plugin_id, error) => console.warn(`plugin ${plugin_id}:`, error),
    });
    for (const plugin of bundled_pages) await host.add(plugin);
    for (const plugin of await folder_pages()) await host.add(plugin);
    await host.start();
    return host;
  })();
  return started;
}

// The started host, or null while it starts.
export function use_page_plugins(): PluginHost<PagePluginApi> | null {
  const [host, set_host] = useState<PluginHost<PagePluginApi> | null>(null);
  useEffect(() => void start_page_plugins().then(set_host), []);
  return host;
}

// For tests, which each start from nothing.
export function forget_page_plugins(): void {
  started = null;
}

// ── Settings ─────────────────────────────────────────────────────────────────

// "No key" while a secret setting is empty, so a catalogue that answers nothing yet says why.
function status_of(host: PluginHost<PagePluginApi>, manifest: PluginManifest, state: string): string {
  if (state === "off") return "Off";
  if (state !== "running") return "Not running";
  const values = host.settings(manifest.id);
  return (manifest.settings ?? []).some((field) => field.type === "text" && field.secret && values[field.key] === "") ? "No key" : "On";
}

function Rows({ host, manifests, settings, set_setting }: { host: PluginHost<PagePluginApi>; manifests: PluginManifest[] } & FeatureSettingsProps) {
  const statuses = use_plugins(host);
  return (
    <>
      {manifests.map((manifest) => {
        const state = statuses.find((status) => status.manifest.id === manifest.id)?.state;
        if (!state) return null;
        return (
          <SettingsDialogRow key={manifest.id} name={manifest.name} status={status_of(host, manifest, state)} about={manifest.description}>
            <PluginSettings host={host} plugin_id={manifest.id} heading={null} />
            {state === "running" ? <PluginSlot host={host} plugin_id={manifest.id} name="panel" props={{ settings, set_setting }} /> : <p className="source-hint">Turn {manifest.name} on to use it.</p>}
          </SettingsDialogRow>
        );
      })}
    </>
  );
}

// A row for each of the plugins given, in their order, each opening its own dialog.
export function PluginRows({ manifests, settings, set_setting }: { manifests: PluginManifest[] } & FeatureSettingsProps) {
  const host = use_page_plugins();
  return host ? <Rows host={host} manifests={manifests} settings={settings} set_setting={set_setting} /> : <Skeleton lines={2} />;
}

// One of a plugin's settings as the page's settings hold it, or its manifest's default.
export function plugin_value(settings: Record<string, unknown>, manifest: PluginManifest, key: string): unknown {
  const stored = (settings[plugins_setting] as PluginRecords | undefined)?.[manifest.id]?.settings?.[key];
  return stored ?? manifest.settings?.find((field) => field.key === key)?.default ?? "";
}

// The plugins from the plugins folder, each with its row, or a line saying where to put one.
export function FolderPluginRows(props: FeatureSettingsProps) {
  const host = use_page_plugins();
  if (!host) return <Skeleton lines={2} />;
  const bundled = new Set(bundled_pages.map((plugin) => plugin.id));
  const manifests = host.list().map((status) => status.manifest).filter((manifest) => !bundled.has(manifest.id));
  if (manifests.length === 0) return <p className="source-hint">No plugins installed. Each goes in its own subfolder of the plugins folder, and shows here after a restart.</p>;
  return <Rows host={host} manifests={manifests} {...props} />;
}
