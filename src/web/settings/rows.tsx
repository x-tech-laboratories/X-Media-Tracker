// Setting rows that more than one feature's settings use: a key or token typed in and kept secret, a line of text saved once the field is left, and how big a library's covers are in its grid.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useState } from "react";
import { CommitInput, Segmented } from "@x-tech-laboratories/x-libs/web/react/controls";
import { SettingRow } from "@x-tech-laboratories/x-libs/web/react/layout";
import { media_grid_sizes, type MediaGridSize } from "@x-tech-laboratories/x-libs/web/react/media";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";

import type { FeatureSettingsProps } from "../features.tsx";

// ── Sources ──────────────────────────────────────────────────────────────────

// Whether a key is set, for a source's row.
export function key_status(settings: Record<string, unknown>, ...keys: string[]): string {
  return keys.every((key) => String(settings[key] ?? "") !== "") ? "Key set" : "No key";
}

// ── Secrets ──────────────────────────────────────────────────────────────────

// Typed in and saved with a button; one already set is never shown again, only said to be set.
export function SecretRow({ label, hint, setting, placeholder, settings, set_setting }: FeatureSettingsProps & { label: string; hint: string; setting: string; placeholder: string }) {
  const [value, set_value] = useState("");
  const is_set = String(settings[setting] ?? "") !== "";
  const save = (next: string, message: string) =>
    set_setting(setting, next)
      .then(() => {
        set_value("");
        toast(message, { tone: "good" });
      })
      .catch((error: unknown) => toast((error as Error).message, { tone: "bad" }));
  return (
    <SettingRow label={label} hint={`${hint} ${is_set ? "One is set." : "None is set yet."}`}>
      <form
        className="key-field"
        onSubmit={(event) => {
          event.preventDefault();
          if (value.trim()) void save(value.trim(), `Saved the ${label.toLowerCase()}.`);
        }}
      >
        <input type="password" aria-label={label} autoComplete="off" spellCheck={false} placeholder={is_set ? "Enter a new one to replace it" : placeholder} value={value} onChange={(event) => set_value(event.currentTarget.value)} />
        <button type="submit" aria-label={`Save the ${label.toLowerCase()}`} disabled={!value.trim()}>
          Save
        </button>
        {is_set && (
          <button type="button" aria-label={`Remove the ${label.toLowerCase()}`} onClick={() => void save("", `Removed the ${label.toLowerCase()}.`)}>
            Remove
          </button>
        )}
      </form>
    </SettingRow>
  );
}

export function TextRow({ label, hint, setting, placeholder, settings, set_setting }: FeatureSettingsProps & { label: string; hint: string; setting: string; placeholder?: string }) {
  return (
    <SettingRow label={label} hint={hint}>
      <CommitInput aria-label={label} placeholder={placeholder} value={String(settings[setting] ?? "")} on_commit={(event) => void set_setting(setting, event.currentTarget.value.trim()).catch((error: unknown) => toast((error as Error).message, { tone: "bad" }))} />
    </SettingRow>
  );
}

// ── Grid size ────────────────────────────────────────────────────────────────

const grid_size_labels: Record<MediaGridSize, string> = { small: "Small", medium: "Medium", large: "Large" };

// A stored grid size, or medium when it is none.
export function grid_size_of(value: unknown): MediaGridSize {
  return media_grid_sizes.find((size) => size === value) ?? "medium";
}

export function GridSizeRow({ hint, setting, settings, set_setting }: FeatureSettingsProps & { hint: string; setting: string }) {
  return (
    <SettingRow label="Grid size" hint={hint}>
      <Segmented
        label="Grid size"
        choices={media_grid_sizes.map((size) => ({ value: size, label: grid_size_labels[size] }))}
        value={grid_size_of(settings[setting])}
        on_change={(size) => void set_setting(setting, size)}
      />
    </SettingRow>
  );
}
