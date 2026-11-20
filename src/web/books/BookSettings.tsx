// The books' settings: a dialog for each source, Hardcover with its key and StoryGraph and LibraryThing with their import
// and export, how new books start, collections, how often new books are looked for and where alerts for them go, and the
// books' own import and export.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useRef, useState, type ChangeEvent } from "react";
import { CommitInput, NumberField, Segmented, Select, Switch } from "@x-tech-laboratories/x-libs/web/react/controls";
import { confirm_dialog } from "@x-tech-laboratories/x-libs/web/react/dialog";
import { SettingRow, type SettingsSection } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Loaded } from "@x-tech-laboratories/x-libs/web/react/states";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";

import { calls, use_data } from "../api.ts";
import { read_picked, save_text } from "../files.ts";
import { SecretRow, SourceRow, TextRow, key_status } from "../settings/rows.tsx";
import type { FeatureSettingsProps } from "../features.tsx";
import { book_status_labels, book_statuses, type BookCollection } from "../../shared/books/model.ts";
import { transfer_section } from "../transfer.tsx";
import { attempt } from "./actions.tsx";
import { book_merge } from "./merge.tsx";

// ── Hardcover and new books ──────────────────────────────────────────────────

function HardcoverSettings(props: FeatureSettingsProps) {
  return (
    <>
      <SecretRow
        {...props}
        label="Hardcover API key"
        setting="books.hardcover_api_key"
        placeholder="Paste your key"
        hint="Make one at hardcover.app/account/api with only the read:catalog scope."
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

// ── LibraryThing ─────────────────────────────────────────────────────────────

function LibraryThingSettings() {
  const file = useRef<HTMLInputElement>(null);

  async function import_file(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const text = await read_picked(event);
    if (text === null) return;
    try {
      const report = await calls().import_librarything(text);
      toast(`Imported ${report.added} new book(s) and merged ${report.updated} already here. Refresh in Books fills in covers and details.`, { tone: "good" });
    } catch (error) {
      toast(`Could not import: ${(error as Error).message}`, { tone: "bad" });
    }
  }

  return (
    <>
      <SettingRow label="Import from LibraryThing" hint="LibraryThing's export from its Import/Export page, tab-separated (.tsv) or CSV: read days, ratings, reviews, owned, status from its Currently reading, To read and Wishlist collections, and its other collections and tags as collections. New books are added and ones already here are merged.">
        <input ref={file} type="file" accept="text/tab-separated-values,text/csv,.tsv,.csv,.txt" hidden aria-label="LibraryThing export file" onChange={(event) => void import_file(event)} />
        <button type="button" onClick={() => file.current?.click()}>
          Import LibraryThing…
        </button>
      </SettingRow>
      <SettingRow label="Export for LibraryThing" hint="The library as a Goodreads library export, which LibraryThing's Goodreads import reads.">
        <button type="button" onClick={() => attempt(calls().export_storygraph().then((csv) => save_text("x-media-tracker-books.csv", csv)))}>
          Export CSV
        </button>
      </SettingRow>
    </>
  );
}

// ── Sections ─────────────────────────────────────────────────────────────────

// One row a source, everything it needs in its dialog.
function SourceSettings(props: FeatureSettingsProps) {
  return (
    <>
      <SourceRow name="Hardcover" status={key_status(props.settings, "books.hardcover_api_key")} about="Optional: adds Hardcover's search, series in order and new books in the series you follow.">
        <HardcoverSettings {...props} />
      </SourceRow>
      <SourceRow name="StoryGraph" status="Import and export files" about="StoryGraph has no API, so books travel through its export files.">
        <StoryGraphSettings />
      </SourceRow>
      <SourceRow name="LibraryThing" status="Import and export files" about="LibraryThing's library travels through its export files.">
        <LibraryThingSettings />
      </SourceRow>
    </>
  );
}

export function book_settings(props: FeatureSettingsProps): SettingsSection[] {
  return [
    { id: "book-sources", heading: "Sources", hint: "BookBrainz and Open Library need no key: search, covers, details and new books by the authors you follow come from them.", content: <SourceSettings {...props} /> },
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
