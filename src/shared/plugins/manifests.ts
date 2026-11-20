// Every bundled plugin's manifest, for the settings that hide their secret fields from other programs.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { PluginManifest } from "@x-tech-laboratories/x-libs/plugins";

import { book_catalog_manifests } from "../books/manifests.ts";
import { game_catalog_manifests } from "../games/manifests.ts";
import { title_catalog_manifests } from "../library/manifests.ts";
import { source_manifests } from "../sources/manifests.ts";

// ── Manifests ────────────────────────────────────────────────────────────────

export const plugin_manifests: PluginManifest[] = [...title_catalog_manifests, ...source_manifests, ...book_catalog_manifests, ...game_catalog_manifests];
