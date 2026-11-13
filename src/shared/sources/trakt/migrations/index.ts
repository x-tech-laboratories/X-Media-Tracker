// Written by x-libs-bundle-migrations from the migration folders beside it; run it again after drizzle-kit generate.

import type { DrizzleMigration } from "@x-tech-laboratories/x-libs/drizzle";

export const migrations: DrizzleMigration[] = [
  {
    "name": "20261113043903_start",
    "statements": [
      "CREATE TABLE `trakt_archives` (\n\t`id` text PRIMARY KEY,\n\t`fetched_at` text NOT NULL,\n\t`counts` text NOT NULL,\n\t`failures` text NOT NULL,\n\t`data` text NOT NULL\n);"
    ]
  }
];
