// Upcoming: the authors and series followed, a search to follow more, and the books found for them, coming soon first,
// the ones not yet looked at marked new; a check for new books can be run at once.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useState } from "react";
import { Badge } from "@x-tech-laboratories/x-libs/web/react/badges";
import { MediaGrid, MediaTile } from "@x-tech-laboratories/x-libs/web/react/media";
import { SearchBox, Segmented } from "@x-tech-laboratories/x-libs/web/react/controls";
import { confirm_dialog } from "@x-tech-laboratories/x-libs/web/react/dialog";
import { PageHeading, Section, Stack } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Empty, Failure, Loaded, Skeleton, use_resource } from "@x-tech-laboratories/x-libs/web/react/states";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";
import { today } from "@x-tech-laboratories/x-libs/dates";

import { calls, use_data, use_settings } from "../api.ts";
import { order_releases, type CatalogRef, type Follow, type FollowKind, type Release } from "../../shared/books/model.ts";
import { attempt, report_added } from "./actions.tsx";

// ── Following ────────────────────────────────────────────────────────────────

const kind_labels: Record<FollowKind, string> = { author: "Author", series: "Series" };

function catalogues_of(ref: CatalogRef): string {
  return [ref.bookbrainz_id && "BookBrainz", ref.openlibrary_id && "Open Library", ref.hardcover_id && "Hardcover"].filter(Boolean).join(", ");
}

function FollowSearch({ follows }: { follows: Follow[] }) {
  const [kind, set_kind] = useState<FollowKind>("author");
  const [query, set_query] = useState("");
  const found = use_resource(() => calls().search_book_people(query, kind), [query, kind], { enabled: query.trim() !== "" });
  const followed_names = new Set(follows.filter((follow) => follow.kind === kind).map((follow) => follow.name.toLowerCase()));
  return (
    <Section
      title="Follow an author or series"
      tools={
        <Segmented
          label="Follow"
          choices={[
            { value: "author", label: "Authors" },
            { value: "series", label: "Series" },
          ]}
          value={kind}
          on_change={set_kind}
        />
      }
    >
      <SearchBox label={kind === "author" ? "Search for an author" : "Search for a series"} value={query} on_input={set_query} on_submit={set_query} />
      {found.status === "loading" && <Skeleton lines={2} />}
      {found.status === "failed" && <Failure error={found.error} retry={() => void found.reload()} />}
      {found.data && query.trim() && found.data.length === 0 && <Empty title={`No catalogue knows “${query}”.`} />}
      {found.data && found.data.length > 0 && (
        <ul className="book-list">
          {found.data.map((ref) => (
            <li key={`${ref.name}:${ref.bookbrainz_id}:${ref.openlibrary_id}:${ref.hardcover_id}`} className="book-row">
              <span>{ref.name}</span>
              <span className="muted">{catalogues_of(ref)}</span>
              {followed_names.has(ref.name.toLowerCase()) ? (
                <Badge tone="good">✓ Following</Badge>
              ) : (
                <button type="button" onClick={() => attempt(calls().follow_book_people(kind, ref).then(() => toast(`Following ${ref.name}.`, { tone: "good" })))}>
                  Follow
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function Follows({ follows }: { follows: Follow[] }) {
  return (
    <Section title={`Following (${follows.length})`}>
      {follows.length === 0 ? (
        <Empty title="Not following anyone yet." hint="Follow an author or series here or from a book's page to hear of their new books." />
      ) : (
        <ul className="book-list">
          {follows.map((follow) => (
            <li key={follow.id} className="book-row">
              <span>{follow.name}</span>
              <span className="muted">
                {kind_labels[follow.kind]} · {catalogues_of(follow)}
              </span>
              <button
                type="button"
                aria-label={`Stop following ${follow.name}`}
                onClick={() => confirm_dialog({ title: `Stop following ${follow.name}?`, message: "The books found for it go too.", confirm_label: "Stop following", danger: true, run: () => calls().unfollow_book_people(follow.id) })}
              >
                Unfollow
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ── Releases ─────────────────────────────────────────────────────────────────

function add_release(release: Release): void {
  const [source, id] = release.hardcover_id ? (["hardcover", release.hardcover_id] as const) : (["openlibrary", release.openlibrary_id] as const);
  attempt(calls().add_book(source, id).then(report_added));
}

function ReleaseTiles({ label, releases }: { label: string; releases: Release[] }) {
  return (
    <MediaGrid label={label}>
      {releases.map((release) => (
        <MediaTile
          key={release.id}
          title={release.title}
          href={release.hardcover_id ? `https://hardcover.app/id/book/${release.hardcover_id}` : `https://openlibrary.org/works/${release.openlibrary_id}`}
          image={release.cover_url}
          corner={release.seen ? undefined : "New"}
          lines={[release.release_date, [release.authors, release.series && `${release.series}${release.series_position ? ` #${release.series_position}` : ""}`].filter(Boolean).join(" · ")]}
          actions={
            <button type="button" onClick={() => add_release(release)}>
              Add
            </button>
          }
        />
      ))}
    </MediaGrid>
  );
}

function Releases({ releases }: { releases: Release[] }) {
  const { upcoming, out } = order_releases(releases, today());
  const unseen = releases.filter((release) => !release.seen).length;
  return (
    <>
      <Section
        title={`Coming (${upcoming.length})`}
        tools={
          unseen > 0 && (
            <button type="button" onClick={() => attempt(calls().mark_releases_seen([]))}>
              Mark {unseen} as seen
            </button>
          )
        }
      >
        {upcoming.length === 0 ? <Empty title="Nothing announced yet." hint="Books announced by the authors and series you follow show here." /> : <ReleaseTiles label="Coming" releases={upcoming} />}
      </Section>
      {out.length > 0 && (
        <Section title={`Out lately (${out.length})`}>
          <ReleaseTiles label="Out lately" releases={out} />
        </Section>
      )}
    </>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

function CheckNow({ last_check, last_result }: { last_check: string; last_result: string }) {
  const [checking, set_checking] = useState(false);
  const check = () => {
    set_checking(true);
    calls()
      .run_release_check(true)
      .then((ran) => {
        if (!ran) return;
        toast(`Found ${ran.found} new book${ran.found === 1 ? "" : "s"}${ran.failures.length ? `; ${ran.failures.join("; ")}` : "."}`, { tone: ran.failures.length ? "bad" : "good" });
      })
      .catch((error: unknown) => toast((error as Error).message, { tone: "bad" }))
      .finally(() => set_checking(false));
  };
  return (
    <>
      <button type="button" disabled={checking} onClick={check}>
        {checking ? "Checking…" : "Check now"}
      </button>
      {last_check && <span className="muted">Last checked {new Date(last_check).toLocaleString()}{last_result ? `: ${last_result}` : ""}</span>}
    </>
  );
}

export function UpcomingView() {
  const follows = use_data((api) => api.list_follows());
  const releases = use_data((api) => api.list_releases());
  const settings = use_settings();
  return (
    <div className="books-page">
      <Stack>
        <PageHeading
          title="Upcoming"
          subtitle="New books by the authors and series you follow, checked on the schedule under Settings → Books."
          actions={<CheckNow last_check={String(settings.data?.["books.last_release_check"] ?? "")} last_result={String(settings.data?.["books.last_release_result"] ?? "")} />}
        />
        <Loaded resource={releases}>{(loaded) => <Releases releases={loaded} />}</Loaded>
        <Loaded resource={follows}>
          {(loaded) => (
            <>
              <Follows follows={loaded} />
              <FollowSearch follows={loaded} />
            </>
          )}
        </Loaded>
      </Stack>
    </div>
  );
}
