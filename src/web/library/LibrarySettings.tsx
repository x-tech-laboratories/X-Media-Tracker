// The library's settings: the TMDB key, how new titles start, genres, collection groups, and the Trilium import and
// export.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useRef, useState, type ChangeEvent } from "react";
import { ChipField } from "@x-tech-laboratories/x-libs/web/react/chip_field";
import { CommitInput, Select, Switch } from "@x-tech-laboratories/x-libs/web/react/controls";
import { confirm_dialog } from "@x-tech-laboratories/x-libs/web/react/dialog";
import { RowActions, Section, SettingRow, type SettingsSection } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Loaded } from "@x-tech-laboratories/x-libs/web/react/states";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";

import { calls, use_data } from "../api.ts";
import type { FeatureSettingsProps } from "../features.tsx";
import { list_genres, poster_sizes, status_labels, statuses, type Collection, type CollectionGroup } from "../../shared/library/model.ts";
import type { Library } from "../../shared/library/store.ts";

// ── General ──────────────────────────────────────────────────────────────────

function TmdbSettings({ settings, set_setting }: FeatureSettingsProps) {
  return (
    <SettingRow label="TMDB API key" hint="A free v3 key from themoviedb.org/settings/api; search, posters, episode lists and details need it." as_label>
      <CommitInput
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={String(settings["library.tmdb_api_key"] ?? "")}
        on_commit={(event) => {
          const key = event.currentTarget.value.trim();
          if (key !== settings["library.tmdb_api_key"]) void set_setting("library.tmdb_api_key", key);
        }}
      />
    </SettingRow>
  );
}

function TitleSettings({ settings, set_setting }: FeatureSettingsProps) {
  return (
    <>
      <SettingRow label="Status for new titles" hint="A title added by hand starts with this; an import sets status from its history instead.">
        <Select
          label="Status for new titles"
          bare
          options={statuses.map((status) => [status, status_labels[status]] as [string, string])}
          value={String(settings["library.default_status"])}
          on_change={(status) => void set_setting("library.default_status", status)}
        />
      </SettingRow>
      <SettingRow label="Poster size" hint="TMDB's image width for the Library's posters.">
        <Select label="Poster size" bare options={poster_sizes.map((size) => [size, size] as [string, string])} value={String(settings["library.poster_size"])} on_change={(size) => void set_setting("library.poster_size", size)} />
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

// ── Import and export ────────────────────────────────────────────────────────

// Hands the picked file's text on, then clears the picker so the same file can be picked again.
async function read_picked(event: ChangeEvent<HTMLInputElement>): Promise<string | null> {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (!file) return null;
  const text = await file.text();
  input.value = "";
  return text;
}

function LibraryData() {
  const trilium_file = useRef<HTMLInputElement>(null);
  const [groups_json, set_groups_json] = useState("");

  async function import_trilium(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const text = await read_picked(event);
    if (text === null) return;
    try {
      const summary = await calls().import_trilium_media(text, groups_json);
      toast(`Imported ${summary.added} new title(s) and merged ${summary.updated} already here.`, { tone: "good" });
    } catch (error) {
      toast(`Could not import: ${(error as Error).message}`, { tone: "bad" });
    }
  }

  async function export_all(): Promise<void> {
    const url = URL.createObjectURL(new Blob([await calls().export_library()], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "x-media-tracker-library.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <SettingRow label="Trilium collection groups" hint="Optional: the add-on's collectionGroups setting from its config note, so collections land in their groups." as_label>
        <input value={groups_json} placeholder='{"groups":[…],"assign":{…}}' spellCheck={false} onChange={(event) => set_groups_json(event.currentTarget.value)} />
      </SettingRow>
      <SettingRow label="Import from Trilium" hint="The Media Tracker add-on's Database note, saved as a .json file; new titles are added and ones already here gain its episodes and collections.">
        <input ref={trilium_file} type="file" accept="application/json,.json" hidden aria-label="Trilium Database file" onChange={(event) => void import_trilium(event)} />
        <button type="button" onClick={() => trilium_file.current?.click()}>
          Import Trilium…
        </button>
      </SettingRow>
      <SettingRow label="Export" hint="The whole library in the Trilium add-on's Database shape, which Import Trilium reads back.">
        <button type="button" onClick={() => void export_all()}>
          Export JSON
        </button>
      </SettingRow>
    </>
  );
}

// ── Sections ─────────────────────────────────────────────────────────────────

export function library_settings(props: FeatureSettingsProps): SettingsSection[] {
  return [
    { id: "tmdb", heading: "TMDB", content: <TmdbSettings {...props} /> },
    { id: "titles", heading: "New titles", content: <TitleSettings {...props} /> },
    { id: "genres", heading: "Genres", hint: "Genres come from TMDB and are refreshed with the Library's Refresh.", content: <GenreSettings {...props} /> },
    {
      id: "collections",
      heading: "Collections",
      hint: "Collections are yours: a title can be in several. Each group, such as Mood or Franchise, becomes its own filter on the Library.",
      content: <CollectionSettings />,
    },
    { id: "library-data", heading: "Import and export", content: <LibraryData /> },
  ];
}
