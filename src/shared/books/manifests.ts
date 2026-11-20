// The bundled book catalogue plugins as the plugin host knows them: their names, versions and settings, with
// Hardcover's key kept secret. The store and the page each start their own side of a plugin from the same manifest.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { PluginManifest, SettingField } from "@x-tech-laboratories/x-libs/plugins";

import { app_info } from "../plugins/app.ts";
import type { SettingMove } from "../plugins/host.ts";

// ── Catalogues ───────────────────────────────────────────────────────────────

function catalog(id: string, name: string, description: string, settings: SettingField[] = []): PluginManifest {
  return { id: `x-media-tracker.${id}`, name, version: app_info.version, app: app_info.id, description, settings };
}

export const openlibrary_manifest = catalog("openlibrary", "Open Library", "The Internet Archive's open catalogue: search, editions by ISBN, covers and an author's new books.");

export const hardcover_manifest = catalog("hardcover", "Hardcover", "Optional: adds Hardcover's search, series in order and new books in the series you follow.", [
  { key: "api_key", label: "API key", hint: "Make one at hardcover.app/account/api with only the read:catalog scope.", type: "text", default: "", placeholder: "Paste your key", secret: true },
]);

export const bookbrainz_manifest = catalog("bookbrainz", "BookBrainz", "MetaBrainz's open, curated catalogue of works, authors and series.");

export const storygraph_manifest = catalog("storygraph", "StoryGraph", "StoryGraph has no API, so books travel through its export files: its export comes in, and the library goes out as the Goodreads file StoryGraph and LibraryThing import.");

export const librarything_manifest = catalog("librarything", "LibraryThing", "LibraryThing's library travels through its export files.");

// The sources whose files come in, each in its own dialog under Settings → Books → Sources.
export const book_file_manifests = [storygraph_manifest, librarything_manifest];

// In the order their searches are joined, so the first to answer about a book wins where they differ.
export const book_catalog_manifests = [openlibrary_manifest, hardcover_manifest, bookbrainz_manifest];

// The books setting Hardcover's key was kept in before it was a plugin, and the plugin field it moves to.
export const moved_book_keys: Record<string, SettingMove> = {
  "books.hardcover_api_key": { plugin: hardcover_manifest.id, field: "api_key" },
};
