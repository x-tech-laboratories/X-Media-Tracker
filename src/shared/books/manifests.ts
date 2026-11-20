// The bundled book catalogue plugins as the plugin host knows them: their names, versions and settings, with
// Hardcover's key kept secret. The store and the page each start their own side of a plugin from the same manifest.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { PluginManifest, SettingField } from "@x-tech-laboratories/x-libs/plugins";

import { app_info } from "../plugins/app.ts";

// ── Catalogues ───────────────────────────────────────────────────────────────

function catalog(id: string, name: string, description: string, settings: SettingField[] = []): PluginManifest {
  return { id: `x-media-tracker.${id}`, name, version: app_info.version, app: app_info.id, description, settings };
}

export const openlibrary_manifest = catalog("openlibrary", "Open Library", "The Internet Archive's open catalogue: search, editions by ISBN, covers and an author's new books.");

export const hardcover_manifest = catalog("hardcover", "Hardcover", "Optional: adds Hardcover's search, series in order and new books in the series you follow.", [
  { key: "api_key", label: "API key", hint: "Make one at hardcover.app/account/api with only the read:catalog scope.", type: "text", default: "", placeholder: "Paste your key", secret: true },
]);

export const bookbrainz_manifest = catalog("bookbrainz", "BookBrainz", "MetaBrainz's open, curated catalogue of works, authors and series.");

// In the order their searches are joined, so the first to answer about a book wins where they differ.
export const book_catalog_manifests = [openlibrary_manifest, hardcover_manifest, bookbrainz_manifest];

// The books setting Hardcover's key was kept in before it was a plugin, and the plugin field it moves to.
export const moved_book_keys: Record<string, { plugin: string; field: string }> = {
  "books.hardcover_api_key": { plugin: hardcover_manifest.id, field: "api_key" },
};
