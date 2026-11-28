// Settings: each feature's own settings, how long History keeps changes, the desktop app's daemons and its own settings,
// sync with the paired devices, backups, and for an admin on the server its users and tokens.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";

import { NumberField, Switch } from "@x-tech-laboratories/x-libs/web/react/controls";
import { BackupSettings } from "@x-tech-laboratories/x-libs/web/react/backup_settings";
import { PageHeading, SettingRow, SettingsPage, type SettingsCategory, type SettingsSection } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Loaded } from "@x-tech-laboratories/x-libs/web/react/states";
import { TrustedCertificates } from "@x-tech-laboratories/x-libs/web/react/certificates";
import { ConnectionSettings } from "@x-tech-laboratories/x-libs/web/react/connections";
import { PeerListeningSettings, SyncSettings } from "@x-tech-laboratories/x-libs/web/react/sync_settings";

import type { DesktopSettings } from "../../shared/desktop.ts";

import { calls, data_watch, page, use_settings } from "../api.ts";
import { page_features, type FeatureSettingsProps } from "../features.tsx";
import { FolderPluginRows } from "../plugins.tsx";
import { settings_transfer_section } from "../transfer.tsx";

// ── History ──────────────────────────────────────────────────────────────────

function history_section(settings: Record<string, unknown>, set_setting: (key: string, value: unknown) => Promise<void>): SettingsSection {
  return {
    id: "history",
    heading: "History",
    hint: "Every change to a title with its episodes and collections, to a book with its reads and journal, to a collection and to a follow is kept, to look back on or restore under History.",
    content: (
      <SettingRow label="Keep changes for" hint="Older changes are pruned; each item always keeps its latest.">
        <NumberField label="Keep changes for" bare unit="days" min={1} value={Number(settings["history.keep_days"])} on_change={(days) => void set_setting("history.keep_days", days ?? 180)} />
      </SettingRow>
    ),
  };
}

// ── Page ─────────────────────────────────────────────────────────────────────

// A phone's backups wait for a folder it picks; the list is read again once one is, as the folder may already hold some.
function Backups() {
  const { backups, backup_folder } = page();
  const [folder_name, set_folder_name] = useState<string | null>(backup_folder ? null : "");
  useEffect(() => void backup_folder?.get().then(set_folder_name), [backup_folder]);
  if (!backups || folder_name === null) return null;

  const folder_row = backup_folder && (
    <SettingRow label="Backup folder" hint={folder_name || "Pick a folder in the phone's storage, such as Documents, where file managers and sync apps can reach the backups."}>
      <button type="button" onClick={() => void backup_folder.choose().then(set_folder_name)}>
        {folder_name ? "Change" : "Choose"}
      </button>
    </SettingRow>
  );
  return <BackupSettings key={folder_name} device={backups} data_name="media library" on_restored={() => data_watch.bump()} folder_row={folder_row} can_back_up={!backup_folder || folder_name !== ""} />;
}

// The desktop app's own settings, which belong to this computer and do not sync.
function Desktop() {
  const { desktop } = page();
  const [settings, set_settings] = useState<DesktopSettings | null>(null);
  useEffect(() => void desktop?.get_desktop_settings().then(set_settings, () => undefined), [desktop]);
  if (!desktop || !settings) return null;

  const change = (key: keyof DesktopSettings, on: boolean): void => {
    set_settings({ ...settings, [key]: on });
    void desktop.set_desktop_setting(key, on);
  };
  return (
    <>
      <SettingRow label="Keep running in the background" hint="Sync, scheduled imports, release checks and backups carry on with the window closed. Turned off, they stop shortly after the last window closes." as_label>
        <Switch label="Keep running in the background" checked={settings.keep_running_in_background} on_change={(on) => change("keep_running_in_background", on)} />
      </SettingRow>
      <SettingRow label="Start at login" hint="Starts X-Media-Tracker in the background when you log in, without opening its window." as_label>
        <Switch label="Start at login" checked={settings.start_at_login} disabled={!settings.keep_running_in_background} on_change={(on) => change("start_at_login", on)} />
      </SettingRow>
      <SettingRow label="Quit completely" hint="Closes the window and stops X-Media-Tracker in the background too, until you open it again.">
        <button type="button" onClick={() => void desktop.quit_completely()}>Quit completely</button>
      </SettingRow>
    </>
  );
}

// The desktop's daemons and own settings, sync of the copy the page works on, backups of whichever database the page
// works on, the plugins of its daemon, and the server's own sections, such as its users. A desktop window on a server's
// daemon works on the server's data, as a browser does.
function data_category(server_sections: SettingsSection[], props: FeatureSettingsProps, is_admin: boolean): SettingsCategory[] {
  const { host, device, backups, backup_folder, certificates, connections, desktop, peer_listening } = page();
  const on_server = host === "web" || (host === "desktop" && !device);
  const sections: SettingsSection[] = [
    ...(connections ? [{ id: "connections", heading: "Connections", hint: "The library this window works on: This computer's own, or an X-Media-Tracker server's.", content: <>
      <ConnectionSettings client={connections} certificates={certificates} placeholder="https://media.example.org" />
      {!device && certificates && <TrustedCertificates certificates={certificates} />}
    </> }] : []),
    ...(desktop ? [{ id: "desktop", heading: "Desktop app", content: <Desktop /> }] : []),
    ...(device && (host !== "web" || is_admin) ? [{ id: "sync", heading: "Sync", hint: on_server ? "Keep the server's library alike with the devices paired with it." : "Keep this device's library alike with your other devices and your X-Media-Tracker server.", content:
      <SyncSettings device={device} subscribe={data_watch.subscribe} data_name="media library" extra={peer_listening && <PeerListeningSettings listening={peer_listening} />} /> }] : []),
    ...(backups
      ? [{ id: "backups", heading: "Backups", hint: backup_folder ? "Copies of this device's data, kept in a folder you pick." : on_server ? "Copies of the server's data, kept in its data folder. A restore restarts the server." : "Copies of this device's data, kept beside it.", content: <Backups /> }]
      : []),
    ...(host === "android"
      ? []
      : [
          {
            id: "plugins",
            heading: "Plugins",
            hint: `Plugins from the ${on_server ? "plugins folder beside the server's database" : "plugins folder in this app's profile"}. They run with the app's full rights: install only ones you trust.`,
            content: <FolderPluginRows {...props} />,
          },
        ]),
    ...server_sections,
  ];
  return sections.length ? [{ heading: on_server ? "Server" : "This device", sections }] : [];
}

// A browser's user who is not an admin sees no server sync, which only an admin may pair.
export function SettingsView({ server_sections = [], is_admin = true }: { server_sections?: SettingsSection[]; is_admin?: boolean }) {
  const settings = use_settings();
  const set_setting = (key: string, value: unknown) => calls().set_setting(key, value);

  return (
    <>
      <PageHeading title="Settings" />
      <Loaded resource={settings}>
        {(values) => (
          <SettingsPage
            categories={[
              { heading: "General", sections: [history_section(values, set_setting), settings_transfer_section()] },
              ...page_features
                .map((feature) => ({ heading: feature.label, sections: feature.settings({ settings: values, set_setting }) }))
                .filter((category) => category.sections.length > 0),
              ...data_category(server_sections, { settings: values, set_setting }, is_admin),
            ]}
          />
        )}
      </Loaded>
    </>
  );
}
