// The books' settings: the Hardcover key, how new books start, collections, how often new books are looked for and where
// the server sends alerts for them, and StoryGraph's import and export.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useRef, useState, type ChangeEvent } from "react";
import { CommitInput, NumberField, Segmented, Select, Switch } from "@x-tech-laboratories/x-libs/web/react/controls";
import { confirm_dialog } from "@x-tech-laboratories/x-libs/web/react/dialog";
import { SettingRow, type SettingsSection } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Loaded } from "@x-tech-laboratories/x-libs/web/react/states";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";

import { calls, use_data } from "../api.ts";
import { read_picked, save_text } from "../files.ts";
import type { FeatureSettingsProps } from "../features.tsx";
import { book_status_labels, book_statuses, type BookCollection } from "../../shared/books/model.ts";
import { attempt } from "./actions.tsx";

// ── Secrets ──────────────────────────────────────────────────────────────────

// Typed in and saved with a button; one already set is never shown again, only said to be set.
function SecretRow({ label, hint, setting, placeholder, settings, set_setting }: FeatureSettingsProps & { label: string; hint: string; setting: string; placeholder: string }) {
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

function TextRow({ label, hint, setting, placeholder, settings, set_setting }: FeatureSettingsProps & { label: string; hint: string; setting: string; placeholder?: string }) {
  return (
    <SettingRow label={label} hint={hint}>
      <CommitInput aria-label={label} placeholder={placeholder} value={String(settings[setting] ?? "")} on_commit={(event) => attempt(set_setting(setting, event.currentTarget.value.trim()))} />
    </SettingRow>
  );
}

// ── Catalogues and new books ─────────────────────────────────────────────────

function CatalogueSettings(props: FeatureSettingsProps) {
  return (
    <>
      <SecretRow
        {...props}
        label="Hardcover API key"
        setting="books.hardcover_api_key"
        placeholder="Paste your key"
        hint="Optional: adds Hardcover's search, series in order and new books in the series you follow. Make one at hardcover.app/account/api with only the read:catalog scope."
      />
      <SettingRow label="Make a Hardcover key" hint="Opens Hardcover's form with read:catalog ticked, so the key can read books but nothing of your account.">
        <a href="https://hardcover.app/account/api/keys/new?scope=read:catalog" target="_blank" rel="noreferrer">
          Open Hardcover
        </a>
      </SettingRow>
    </>
  );
}

function NewBookSettings({ settings, set_setting }: FeatureSettingsProps) {
  return (
    <>
      <SettingRow label="Status for new books" hint="A book added by hand starts with this; an import takes its status from the file.">
        <Segmented
          label="Status for new books"
          choices={book_statuses.map((status) => ({ value: status, label: book_status_labels[status] }))}
          value={String(settings["books.default_status"]) as (typeof book_statuses)[number]}
          on_change={(status) => attempt(set_setting("books.default_status", status))}
        />
      </SettingRow>
      <SettingRow label="Imports replace ratings" hint="Off keeps a rating already set; on lets a StoryGraph import's rating replace it.">
        <Switch label="Imports replace ratings" checked={settings["books.import_overwrite_ratings"] === true} on_change={(on) => set_setting("books.import_overwrite_ratings", on)} />
      </SettingRow>
    </>
  );
}

// ── Collections ──────────────────────────────────────────────────────────────

function CollectionRow({ collection }: { collection: BookCollection }) {
  return (
    <li className="collection-row">
      <CommitInput
        aria-label={`Name of ${collection.name}`}
        value={collection.name}
        on_commit={(event) => {
          const name = event.currentTarget.value.trim();
          if (name && name !== collection.name) attempt(calls().save_book_collection({ id: collection.id, name }));
        }}
      />
      <button
        type="button"
        aria-label={`Remove ${collection.name}`}
        onClick={() => confirm_dialog({ title: `Remove ${collection.name}?`, message: "Its books stay; they only leave this collection.", confirm_label: "Remove", danger: true, run: () => calls().remove_book_collection(collection.id) })}
      >
        ×
      </button>
    </li>
  );
}

function CollectionSettings() {
  const books = use_data((api) => api.list_books());
  const [name, set_name] = useState("");
  return (
    <Loaded resource={books}>
      {(loaded) => (
        <>
          <ul className="collection-list">
            {loaded.collections.map((collection) => (
              <CollectionRow key={collection.id} collection={collection} />
            ))}
          </ul>
          <form
            className="add-field"
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim()) attempt(calls().save_book_collection({ name: name.trim() }).then(() => set_name("")));
            }}
          >
            <input aria-label="New book collection" placeholder="New collection, such as Book club" value={name} onChange={(event) => set_name(event.currentTarget.value)} />
            <button type="submit">Add</button>
          </form>
        </>
      )}
    </Loaded>
  );
}

// ── Alerts ───────────────────────────────────────────────────────────────────

const channel_labels: [string, string][] = [
  ["none", "None, only in the app"],
  ["ntfy", "ntfy"],
  ["webhook", "Webhook"],
  ["mail", "Email"],
];

function AlertSettings(props: FeatureSettingsProps) {
  const { settings, set_setting } = props;
  const channel = String(settings["books.alerts_channel"]);
  return (
    <>
      <SettingRow label="Look for new books every" hint="The server and the desktop app look on this schedule; Upcoming's Check now looks at once.">
        <NumberField label="Look for new books every" bare unit="hours" min={1} value={Number(settings["books.release_check_hours"])} on_change={(hours) => attempt(set_setting("books.release_check_hours", hours ?? 24))} />
      </SettingRow>
      <SettingRow label="Send alerts by" hint="The server sends one alert for each new book found. Books already announced when you follow someone fill Upcoming without an alert.">
        <Select label="Send alerts by" bare options={channel_labels} value={channel} on_change={(next) => attempt(set_setting("books.alerts_channel", next))} />
      </SettingRow>
      {channel === "ntfy" && (
        <>
          <TextRow {...props} label="ntfy server" setting="books.alerts_ntfy_url" placeholder="https://ntfy.sh" hint="The ntfy server, ntfy.sh unless you run your own." />
          <SecretRow {...props} label="ntfy topic" setting="books.alerts_ntfy_topic" placeholder="Such as my-books-8f3k" hint="Anyone who knows the topic can read it, so pick one hard to guess." />
          <SecretRow {...props} label="ntfy access token" setting="books.alerts_ntfy_token" placeholder="tk_…" hint="Only if the server asks for one." />
        </>
      )}
      {channel === "webhook" && <SecretRow {...props} label="Webhook address" setting="books.alerts_webhook_url" placeholder="https://…" hint="Gets a POST of JSON with the book's title, authors, series and release day." />}
      {channel === "mail" && (
        <>
          <TextRow {...props} label="Mail server" setting="books.alerts_mail_host" placeholder="smtp.example.org" hint="The SMTP server that sends the alerts." />
          <SettingRow label="Mail port" hint="587 for STARTTLS, 465 for TLS.">
            <NumberField label="Mail port" bare min={1} max={65535} value={Number(settings["books.alerts_mail_port"])} on_change={(port) => attempt(set_setting("books.alerts_mail_port", port ?? 587))} />
          </SettingRow>
          <SettingRow label="Mail security" hint="How the connection to the server is protected.">
            <Select
              label="Mail security"
              bare
              options={[
                ["starttls", "STARTTLS"],
                ["tls", "TLS"],
                ["none", "None"],
              ]}
              value={String(settings["books.alerts_mail_security"])}
              on_change={(security) => attempt(set_setting("books.alerts_mail_security", security))}
            />
          </SettingRow>
          <TextRow {...props} label="Mail user name" setting="books.alerts_mail_username" hint="Leave empty when the server needs no sign-in." />
          <SecretRow {...props} label="Mail password" setting="books.alerts_mail_password" placeholder="Password" hint="For the user name above." />
          <TextRow {...props} label="From" setting="books.alerts_mail_from" placeholder="books@example.org" hint="The sender's address." />
          <TextRow {...props} label="To" setting="books.alerts_mail_to" placeholder="me@example.org" hint="Where alerts go; separate several with commas." />
        </>
      )}
    </>
  );
}

// ── StoryGraph ───────────────────────────────────────────────────────────────

function StoryGraphSettings() {
  const file = useRef<HTMLInputElement>(null);

  async function import_file(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const text = await read_picked(event);
    if (text === null) return;
    try {
      const report = await calls().import_storygraph(text);
      toast(`Imported ${report.added} new book(s) and merged ${report.updated} already here. Refresh in Books fills in covers and details.`, { tone: "good" });
    } catch (error) {
      toast(`Could not import: ${(error as Error).message}`, { tone: "bad" });
    }
  }

  return (
    <>
      <SettingRow label="Import from StoryGraph" hint="StoryGraph's export from its Manage Account page, a .csv file: statuses, read days, ratings, reviews, owned and tags as collections. New books are added and ones already here are merged.">
        <input ref={file} type="file" accept="text/csv,.csv" hidden aria-label="StoryGraph export file" onChange={(event) => void import_file(event)} />
        <button type="button" onClick={() => file.current?.click()}>
          Import StoryGraph…
        </button>
      </SettingRow>
      <SettingRow label="Export for StoryGraph" hint="The library as a Goodreads library export, which StoryGraph's Goodreads import (and Hardcover's) reads.">
        <button type="button" onClick={() => attempt(calls().export_storygraph().then((csv) => save_text("x-media-tracker-books.csv", csv)))}>
          Export CSV
        </button>
      </SettingRow>
    </>
  );
}

// ── Sections ─────────────────────────────────────────────────────────────────

export function book_settings(props: FeatureSettingsProps): SettingsSection[] {
  return [
    { id: "book-catalogues", heading: "Catalogues", hint: "BookBrainz and Open Library need no key: search, covers, details and new books by the authors you follow come from them.", content: <CatalogueSettings {...props} /> },
    { id: "new-books", heading: "New books", content: <NewBookSettings {...props} /> },
    { id: "book-collections", heading: "Book collections", hint: "Your own shelves, such as Book club or Favourites; a book can be in several.", content: <CollectionSettings /> },
    { id: "book-alerts", heading: "New books and alerts", content: <AlertSettings {...props} /> },
    { id: "storygraph", heading: "StoryGraph", hint: "StoryGraph has no API, so books travel through its export files.", content: <StoryGraphSettings /> },
  ];
}
