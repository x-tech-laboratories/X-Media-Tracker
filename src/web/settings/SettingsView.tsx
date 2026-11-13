// Settings: each feature's own settings, how long History keeps changes, sync with a server on a device, and backups.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";

import { NumberField } from "@x-tech-laboratories/x-libs/web/react/controls";
import { BackupSettings } from "@x-tech-laboratories/x-libs/web/react/backup_settings";
import { PageHeading, SettingRow, SettingsPage, type SettingsCategory, type SettingsSection } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Loaded } from "@x-tech-laboratories/x-libs/web/react/states";
import { TrustedCertificates } from "@x-tech-laboratories/x-libs/web/react/certificates";
import { SyncSettings } from "@x-tech-laboratories/x-libs/web/react/sync_settings";

import { calls, data_watch, page, use_settings } from "../api.ts";
import { page_features } from "../features.tsx";

// ── History ──────────────────────────────────────────────────────────────────

function history_section(settings: Record<string, unknown>, set_setting: (key: string, value: unknown) => Promise<void>): SettingsSection {
  return {
    id: "history",
    heading: "History",
    hint: "Every change to a title, its episodes and collections, and to a collection is kept, to look back on or restore under History.",
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

// Sync on a device with its own database, and backups of whichever database the page works on.
function data_category(): SettingsCategory[] {
  const { device, backups, backup_folder, certificates } = page();
  const sections: SettingsSection[] = [
    ...(device ? [{ id: "sync", heading: "Sync", hint: "Keep this device's data alike with your X-Media-Tracker server.", content: <>
      <SyncSettings device={device} certificates={certificates} subscribe={data_watch.subscribe} data_name="media library" placeholder="https://media.example.org/" />
      {certificates && <TrustedCertificates certificates={certificates} />}
    </> }] : []),
    ...(backups
      ? [{ id: "backups", heading: "Backups", hint: backup_folder ? "Copies of this device's data, kept in a folder you pick." : device ? "Copies of this device's data, kept beside it." : "Copies of the server's data, kept in its data folder. A restore restarts the server.", content: <Backups /> }]
      : []),
  ];
  return sections.length ? [{ heading: device ? "This device" : "Server", sections }] : [];
}

export function SettingsView() {
  const settings = use_settings();
  const set_setting = (key: string, value: unknown) => calls().set_setting(key, value);

  return (
    <>
      <PageHeading title="Settings" />
      <Loaded resource={settings}>
        {(values) => (
          <SettingsPage
            categories={[
              { heading: "General", sections: [history_section(values, set_setting)] },
              ...page_features
                .map((feature) => ({ heading: feature.label, sections: feature.settings({ settings: values, set_setting }) }))
                .filter((category) => category.sections.length > 0),
              ...data_category(),
            ]}
          />
        )}
      </Loaded>
    </>
  );
}
