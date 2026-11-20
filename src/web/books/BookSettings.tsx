// The books' settings: a dialog for each source plugin, the catalogues with their settings and StoryGraph and
// LibraryThing with their import and export, how new books start, collections, how often new books are looked for and where alerts for them go, and the
// books' own import and export.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useState } from "react";
import { CommitInput, NumberField, Segmented, Select, Switch } from "@x-tech-laboratories/x-libs/web/react/controls";
import { confirm_dialog } from "@x-tech-laboratories/x-libs/web/react/dialog";
import { SettingRow, type SettingsSection } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Loaded } from "@x-tech-laboratories/x-libs/web/react/states";

import { calls, use_data } from "../api.ts";
import { PluginRows } from "../plugins.tsx";
import { SecretRow, TextRow } from "../settings/rows.tsx";
import type { FeatureSettingsProps } from "../features.tsx";
import { book_catalog_manifests, book_file_manifests } from "../../shared/books/manifests.ts";
import { book_status_labels, book_statuses, type BookCollection } from "../../shared/books/model.ts";
import { transfer_section } from "../transfer.tsx";
import { attempt } from "./actions.tsx";
import { book_merge } from "./merge.tsx";

// ── New books ────────────────────────────────────────────────────────────────

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
      <SettingRow label="Imports replace ratings" hint="Off keeps a rating already set; on lets a StoryGraph or LibraryThing import's rating replace it.">
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

// ── Sections ─────────────────────────────────────────────────────────────────

// One row a source, everything it needs in its dialog.
function SourceSettings(props: FeatureSettingsProps) {
  return (
    <>
      <PluginRows manifests={[...book_catalog_manifests, ...book_file_manifests]} {...props} />
    </>
  );
}

export function book_settings(props: FeatureSettingsProps): SettingsSection[] {
  return [
    { id: "book-sources", heading: "Sources", hint: "Each catalogue and source is a plugin: turn it off to leave it out. Open Library and BookBrainz need no key; Hardcover answers once its key is set; StoryGraph and LibraryThing travel through their export files.", content: <SourceSettings {...props} /> },
    { id: "new-books", heading: "New books", content: <NewBookSettings {...props} /> },
    { id: "book-collections", heading: "Book collections", hint: "Your own shelves, such as Book club or Favourites; a book can be in several.", content: <CollectionSettings /> },
    { id: "book-alerts", heading: "New books and alerts", content: <AlertSettings {...props} /> },
    transfer_section({
      name: "books",
      noun: "book",
      holds: "Every book with its status, rating, review, notes, progress and ids, every read and journal entry, the collections, the authors and series you follow, and your reading goals.",
      export_json: () => calls().export_books_json(),
      export_csv: () => calls().export_books_csv(),
      import_file: (input) => calls().import_books_file(input),
      merging: async () => ({ kind: book_merge, items: (await calls().list_books()).books }),
    }),
  ];
}
