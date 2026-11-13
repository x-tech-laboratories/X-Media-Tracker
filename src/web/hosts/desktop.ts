// The desktop app's page: the preload has put the main process's calls on the window.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { Client } from "@x-tech-laboratories/x-libs/electron/bridge";
import type { CertificateClient } from "@x-tech-laboratories/x-libs/certificate_protocol";
import type { EventsClient } from "@x-tech-laboratories/x-libs/electron/events";

import { certificates_api_name, device_api_name, events_api_name, media_api_name, type DeviceMethods, type MediaEvents, type PageApi } from "../../shared/page_api.ts";
import type { MediaMethods } from "../../shared/store.ts";

// ── Api ──────────────────────────────────────────────────────────────────────

type DesktopWindow = Record<string, unknown>;

export function is_desktop(): boolean {
  return media_api_name in window;
}

export function desktop_api(): PageApi {
  const desktop = window as unknown as DesktopWindow;
  const events = desktop[events_api_name] as EventsClient<MediaEvents>;
  const device = desktop[device_api_name] as Client<DeviceMethods>;
  return {
    host: "desktop",
    calls: desktop[media_api_name] as Client<MediaMethods>,
    device,
    backups: device,
    certificates: desktop[certificates_api_name] as CertificateClient,
    on_change: (listener) => events.on("changed", listener),
  };
}
