// The library's settings: a dialog for each source, TMDB with its key and Trakt and Stremio with their imports, how new
// titles start, genres, collection groups, import and export, and how often the sources import.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useState } from "react";
import { ChipField } from "@x-tech-laboratories/x-libs/web/react/chip_field";
import { CommitInput, Segmented, Select, Switch } from "@x-tech-laboratories/x-libs/web/react/controls";
import { confirm_dialog } from "@x-tech-laboratories/x-libs/web/react/dialog";
import { RowActions, Section, SettingRow, type SettingsSection } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Loaded } from "@x-tech-laboratories/x-libs/web/react/states";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";

import { calls, use_data } from "../api.ts";
import type { FeatureSettingsProps } from "../features.tsx";
import { title_catalog_manifests } from "../../shared/library/manifests.ts";
import { list_genres, poster_sizes, saved_poster_sizes, status_labels, statuses, type Collection, type CollectionGroup } from "../../shared/library/model.ts";
import type { Library } from "../../shared/library/store.ts";
import { PluginRows } from "../plugins.tsx";
import { SourcePluginRows, automatic_imports_section } from "../sources/SourceSettings.tsx";
import { transfer_section } from "../transfer.tsx";
import { title_merge } from "./merge.tsx";

// ── General ──────────────────────────────────────────────────────────────────

function TitleSettings({ settings, set_setting }: FeatureSettingsProps) {
  return (
    <>
      <SettingRow label="Status for new titles" hint="A title added by hand starts with this; an import sets status from its history instead.">
        <Segmented
          label="Status for new titles"
          choices={statuses.map((status) => ({ value: status, label: status_labels[status] }))}
          value={String(settings["library.default_status"]) as (typeof statuses)[number]}
          on_change={(status) => void set_setting("library.default_status", status)}
        />
      </SettingRow>
      <SettingRow label="Poster size" hint="TMDB's image width for posters not yet kept on this device, and for search results.">
        <Select label="Poster size" bare options={poster_sizes.map((size) => [size, size] as [string, string])} value={String(settings["library.poster_size"])} on_change={(size) => void set_setting("library.poster_size", size)} />
      </SettingRow>
      <SettingRow label="Kept poster size" hint="TMDB's image width for the posters every device keeps, so they show offline. A change downloads every poster again; original is often over 1 MB each.">
        <Select
          label="Kept poster size"
          bare
          options={saved_poster_sizes.map((size) => [size, size] as [string, string])}
          value={String(settings["library.saved_poster_size"])}
          on_change={(size) => void set_setting("library.saved_poster_size", size)}
        />
      </SettingRow>
    </>
  );
}

function GenreSettings({ settings, set_setting }: FeatureSettingsProps) {
  const library = use_data((api) => api.list_library());
  const enabled = settings["library.genres_enabled"] !== false;
  return (
    <>
      <SettingRow label="Filter by genre" hint="Off hides the genre filter and the genres on a title's page, for sorting everything into your own collections instead. Nothing is deleted.">
        <Switch label="Filter by genre" checked={enabled} on_change={(on) => set_setting("library.genres_enabled", on)} />
      </SettingRow>
      {enabled && (
        <SettingRow label="Hidden genres" hint="Left out of the Library's genre filter; titles keep them.">
          <Loaded resource={library}>
            {(loaded) => (
              <ChipField
                label="Hidden genres"
                values={settings["library.hidden_genres"] as string[]}
                suggestions={list_genres(loaded.titles)}
                list_on_focus
                placeholder="Hide a genre"
                on_change={(genres) => void set_setting("library.hidden_genres", genres)}
              />
            )}
          </Loaded>
        </SettingRow>
      )}
    </>
  );
}

// ── Collections ──────────────────────────────────────────────────────────────

function report(work: Promise<unknown>): void {
  work.catch((error: unknown) => toast((error as Error).message, { tone: "bad" }));
}

function CollectionRow({ collection, groups }: { collection: Collection; groups: CollectionGroup[] }) {
  return (
    <li className="collection-row">
      <CommitInput
        aria-label={`Name of ${collection.name}`}
        value={collection.name}
        on_commit={(event) => {
          const name = event.currentTarget.value.trim();
          if (name && name !== collection.name) report(calls().save_collection({ id: collection.id, name, group_id: collection.group_id }));
        }}
      />
      <Select
        label={`Group of ${collection.name}`}
        bare
        options={[["", "No group"], ...groups.map((group) => [group.id, group.name] as [string, string])]}
        value={collection.group_id ?? ""}
        on_change={(group_id) => report(calls().save_collection({ id: collection.id, name: collection.name, group_id: group_id || null }))}
      />
      <button
        type="button"
        aria-label={`Remove ${collection.name}`}
        onClick={() =>
          confirm_dialog({
            title: `Remove ${collection.name}?`,
            message: "Its titles stay in the library; they only leave this collection.",
            confirm_label: "Remove",
            danger: true,
            run: () => calls().remove_collection(collection.id),
          })
        }
      >
        ×
      </button>
    </li>
  );
}

function AddField({ label, on_add }: { label: string; on_add: (name: string) => Promise<unknown> }) {
  const [name, set_name] = useState("");
  return (
    <form
      className="add-field"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) return;
        report(on_add(name.trim()).then(() => set_name("")));
      }}
    >
      <input aria-label={label} placeholder={label} value={name} onChange={(event) => set_name(event.currentTarget.value)} />
      <button type="submit">Add</button>
    </form>
  );
}

function CollectionGroups({ library }: { library: Library }) {
  const blocks = [...library.groups, { id: "", name: "In no group", position: library.groups.length }];
  return (
    <>
      {blocks.map((group, index) => {
        const members = library.collections.filter((collection) => (collection.group_id ?? "") === group.id);
        if (group.id === "" && members.length === 0) return null;
        const tools = group.id ? (
          <RowActions
            index={index}
            count={library.groups.length}
            remove_label={`Remove ${group.name}`}
            on_move={(from, to) => report(calls().move_collection_group(group.id, to < from ? -1 : 1))}
            on_remove={() =>
              confirm_dialog({
                title: `Remove the group ${group.name}?`,
                message: "Its collections stay, in no group.",
                confirm_label: "Remove",
                danger: true,
                run: () => calls().remove_collection_group(group.id),
              })
            }
          />
        ) : undefined;
        return (
          <Section
            key={group.id}
            title={
              group.id ? (
                <CommitInput
                  aria-label={`Name of the group ${group.name}`}
                  value={group.name}
                  on_commit={(event) => {
                    const name = event.currentTarget.value.trim();
                    if (name && name !== group.name) report(calls().save_collection_group({ id: group.id, name }));
                  }}
                />
              ) : (
                group.name
              )
            }
            tools={tools}
          >
            <ul className="collection-list">
              {members.map((collection) => (
                <CollectionRow key={collection.id} collection={collection} groups={library.groups} />
              ))}
            </ul>
            {group.id && <AddField label={`New collection in ${group.name}`} on_add={(name) => calls().save_collection({ name, group_id: group.id })} />}
          </Section>
        );
      })}
      <AddField label="New group, such as Mood or Franchise" on_add={(name) => calls().save_collection_group({ name })} />
    </>
  );
}

function CollectionSettings() {
  const library = use_data((api) => api.list_library());
  return <Loaded resource={library}>{(loaded) => <CollectionGroups library={loaded} />}</Loaded>;
}

// ── Sections ─────────────────────────────────────────────────────────────────

export function library_settings(props: FeatureSettingsProps): SettingsSection[] {
  return [
    {
      id: "sources",
      heading: "Sources",
      hint: "Each source's dialog holds its key or sign-in and its import. Imports are one way and additive: they add titles and merge ones already here, never removing any.",
      content: (
        <>
          <PluginRows manifests={title_catalog_manifests} />
          <SourcePluginRows />
        </>
      ),
    },
    { id: "titles", heading: "New titles", content: <TitleSettings {...props} /> },
    { id: "genres", heading: "Genres", hint: "Genres come from TMDB and are refreshed with the Library's Refresh.", content: <GenreSettings {...props} /> },
    {
      id: "collections",
      heading: "Collections",
      hint: "Collections are yours: a title can be in several. Each group, such as Mood or Franchise, becomes its own filter on the Library.",
      content: <CollectionSettings />,
    },
    transfer_section({
      name: "movies",
      noun: "title",
      holds: "Every movie and show with its status, rating, notes and ids, every watched episode, and the collections and their groups.",
      export_json: () => calls().export_library_json(),
      export_csv: () => calls().export_library_csv(),
      import_file: (input) => calls().import_library_file(input),
      merging: async () => ({ kind: title_merge, items: (await calls().list_library()).titles }),
    }),
    automatic_imports_section(props),
  ];
}
