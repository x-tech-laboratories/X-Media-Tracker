// The page's side of the plugins: a row in Settings for each, whose dialog holds its on or off, its settings and its
// own panel, and the parts sources add elsewhere, such as Stremio's links on each title's page. On or off and each
// plugin's settings are the same synced records the store's side reads, so a plugin turned off here stops everywhere.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useEffect, useState, type ComponentType } from "react";
import { create_plugin_host, define_plugin, type PluginHost, type PluginManifest, type PluginRecords } from "@x-tech-laboratories/x-libs/plugins";
import { PluginSettings, PluginSlot, use_plugins } from "@x-tech-laboratories/x-libs/web/react/plugins";
import { Skeleton } from "@x-tech-laboratories/x-libs/web/react/states";

import { calls } from "./api.ts";
import { IgdbImport } from "./games/IgdbImport.tsx";
import { SourceRow } from "./settings/rows.tsx";
import { StremioPanel } from "./sources/StremioPanel.tsx";
import { StremioTitleLinks } from "./sources/StremioTitleLinks.tsx";
import { TraktPanel } from "./sources/TraktPanel.tsx";
import { game_catalog_manifests, igdb_manifest } from "../shared/games/manifests.ts";
import type { MediaType } from "../shared/library/model.ts";
import { app_info, plugins_setting } from "../shared/plugins/app.ts";
import { stremio_manifest, trakt_manifest } from "../shared/sources/manifests.ts";

// ── Api ──────────────────────────────────────────────────────────────────────

export interface PagePluginApi {
  slots: {
    // What the plugin's dialog in Settings shows below its settings, such as signing in and importing.
    import_panel: ComponentType<Record<string, never>>;
    // Buttons beside a title's name; imdb_id is "" when neither the title nor TMDB has one.
    title_actions: ComponentType<{ media_type: MediaType; imdb_id: string }>;
  };
}

const trakt_page = define_plugin<PagePluginApi>({ ...trakt_manifest, start: (context) => context.fill_slot("import_panel", TraktPanel) });

const stremio_page = define_plugin<PagePluginApi>({
  ...stremio_manifest,
  start: (context) => {
    context.fill_slot("import_panel", StremioPanel);
    // The Web button follows the address in the plugin's settings, read again on each draw.
    context.fill_slot("title_actions", (props) => <StremioTitleLinks {...props} web_address={String(context.settings().web_address ?? "")} />);
  },
});

// A game catalogue's page side has only its settings, but IGDB's dialog also takes its data export.
const game_catalog_pages = game_catalog_manifests.map((manifest) =>
  define_plugin<PagePluginApi>({ ...manifest, start: (context) => (manifest.id === igdb_manifest.id ? context.fill_slot("import_panel", IgdbImport) : undefined) }),
);

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
    for (const plugin of [trakt_page, stremio_page, ...game_catalog_pages]) await host.add(plugin);
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

// The host as one plugin sees it, so the shared widgets draw only that plugin's settings and panel.
function only_plugin(host: PluginHost<PagePluginApi>, plugin_id: string): PluginHost<PagePluginApi> {
  return {
    ...host,
    list: () => host.list().filter((status) => status.manifest.id === plugin_id),
    slot: ((name) => host.slot(name).filter((part) => part.plugin_id === plugin_id)) as PluginHost<PagePluginApi>["slot"],
  };
}

// "No key" while a secret setting is empty, so a catalogue that answers nothing yet says why.
function status_of(host: PluginHost<PagePluginApi>, manifest: PluginManifest, state: string): string {
  if (state === "off") return "Off";
  if (state !== "running") return "Not running";
  const values = host.settings(manifest.id);
  return (manifest.settings ?? []).some((field) => field.type === "text" && field.secret && values[field.key] === "") ? "No key" : "On";
}

function Rows({ host, manifests }: { host: PluginHost<PagePluginApi>; manifests: PluginManifest[] }) {
  const statuses = use_plugins(host);
  return (
    <>
      {manifests.map((manifest) => {
        const state = statuses.find((status) => status.manifest.id === manifest.id)?.state;
        if (!state) return null;
        const one = only_plugin(host, manifest.id);
        return (
          <SourceRow key={manifest.id} name={manifest.name} status={status_of(host, manifest, state)} about={manifest.description}>
            <PluginSettings host={one} heading={null} />
            {state === "running" ? <PluginSlot host={one} name="import_panel" props={{}} /> : <p className="source-hint">Turn {manifest.name} on to use it.</p>}
          </SourceRow>
        );
      })}
    </>
  );
}

// A row for each of the plugins given, in their order, each opening its own dialog.
export function PluginRows({ manifests }: { manifests: PluginManifest[] }) {
  const host = use_page_plugins();
  return host ? <Rows host={host} manifests={manifests} /> : <Skeleton lines={2} />;
}
