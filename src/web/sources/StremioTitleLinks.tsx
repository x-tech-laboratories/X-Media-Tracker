// The Stremio plugin's buttons on a title's page: open it in the installed Stremio app or in Stremio Web.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { MediaType } from "../../shared/library/model.ts";
import { stremio_links } from "../../shared/sources/stremio/links.ts";

// ── Links ────────────────────────────────────────────────────────────────────

export function StremioTitleLinks({ media_type, imdb_id, web_address }: { media_type: MediaType; imdb_id: string; web_address: string }) {
  const links = stremio_links(media_type, imdb_id, web_address);
  if (!links) return null;
  return (
    <>
      <a className="button" href={links.app}>
        Open in Stremio
      </a>
      <a className="button" href={links.web} target="_blank" rel="noreferrer">
        Stremio Web
      </a>
    </>
  );
}
