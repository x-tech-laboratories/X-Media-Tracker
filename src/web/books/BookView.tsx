// One book's page: its cover, status, rating, format, owned, progress and collections, its authors and series to follow,
// the review, every read with its days, the reading journal, and the series in order with what has been read.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useState } from "react";
import { Badge } from "@x-tech-laboratories/x-libs/web/react/badges";
import { ChipField } from "@x-tech-laboratories/x-libs/web/react/chip_field";
import { DateTimeField, NumberField, Select, Switch } from "@x-tech-laboratories/x-libs/web/react/controls";
import { confirm_dialog, Dialog, open_dialog } from "@x-tech-laboratories/x-libs/web/react/dialog";
import { Facts, PageHeading, Section, Stack } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Markdown } from "@x-tech-laboratories/x-libs/web/react/markdown";
import { ProgressBar } from "@x-tech-laboratories/x-libs/web/react/progress";
import { Rating } from "@x-tech-laboratories/x-libs/web/react/rating";
import { RichText } from "@x-tech-laboratories/x-libs/web/react/rich_text";
import { Empty, Failure, Loaded, Skeleton, use_resource } from "@x-tech-laboratories/x-libs/web/react/states";
import { today } from "@x-tech-laboratories/x-libs/dates";

import { calls, use_data } from "../api.ts";
import {
  book_format_labels,
  book_formats,
  book_links,
  book_status_labels,
  book_statuses,
  format_minutes,
  progress_share,
  progress_text,
  progress_units,
  type BookCollection,
  type BookFormat,
  type BookRead,
  type CatalogRef,
  type Follow,
  type FollowKind,
  type JournalEntry,
  type LibraryBook,
  type ProgressUnit,
} from "../../shared/books/model.ts";
import type { CatalogSeries } from "../../shared/books/catalog.ts";
import { attempt, book_href, report_added, set_book_status } from "./actions.tsx";

// ── Facts ────────────────────────────────────────────────────────────────────

const unit_labels: Record<ProgressUnit, string> = { pages: "Pages", percent: "Percent", minutes: "Minutes" };

function Progress({ book }: { book: LibraryBook }) {
  const share = progress_share(book);
  const max = book.progress_unit === "percent" ? 100 : book.progress_unit === "pages" ? book.pages || undefined : book.audio_minutes || undefined;
  return (
    <div className="book-progress">
      <NumberField label="Progress" bare min={0} max={max} value={book.progress || null} on_change={(value) => attempt(calls().set_book_progress(book.id, value ?? 0, book.progress_unit))} />
      <Select
        label="Progress in"
        bare
        options={progress_units.map((unit) => [unit, unit_labels[unit]] as [ProgressUnit, string])}
        value={book.progress_unit}
        on_change={(unit) => attempt(calls().set_book_progress(book.id, unit === "percent" ? Math.min(book.progress, 100) : book.progress, unit))}
      />
      {share !== null && book.progress > 0 && <ProgressBar label="Progress" value={Math.round(share * 100)} max={100} detail={progress_text(book)} />}
    </div>
  );
}

function Collections({ book, collections }: { book: LibraryBook; collections: BookCollection[] }) {
  const names = new Map(collections.map((collection) => [collection.id, collection.name]));
  const chosen = book.collection_ids.map((id) => names.get(id)).filter((name): name is string => !!name);
  // A name not yet a collection is made one.
  const save = async (next: string[]) => {
    const ids = await Promise.all(next.map((name) => collections.find((collection) => collection.name.toLowerCase() === name.toLowerCase())?.id ?? calls().save_book_collection({ name })));
    await calls().set_book_collections(book.id, ids);
  };
  return <ChipField label="Collections" values={chosen} suggestions={collections.map((collection) => collection.name)} list_on_focus add_label="Add" placeholder="Add to a collection" on_change={(next) => attempt(save(next))} />;
}

// ── Following ────────────────────────────────────────────────────────────────

function is_followed(follows: Follow[], kind: FollowKind, ref: CatalogRef): Follow | undefined {
  const same = (one: string, other: string) => !!one && one === other;
  return follows.find(
    (follow) =>
      follow.kind === kind &&
      (same(follow.bookbrainz_id, ref.bookbrainz_id) || same(follow.openlibrary_id, ref.openlibrary_id) || same(follow.hardcover_id, ref.hardcover_id) || follow.name.toLowerCase() === ref.name.toLowerCase()),
  );
}

function FollowButton({ kind, target, follows }: { kind: FollowKind; target: CatalogRef; follows: Follow[] }) {
  const [busy, set_busy] = useState(false);
  const followed = is_followed(follows, kind, target);
  const toggle = () => {
    set_busy(true);
    const work = followed ? calls().unfollow_book_people(followed.id) : calls().follow_book_people(kind, target);
    attempt(work.finally(() => set_busy(false)));
  };
  return (
    <button type="button" disabled={busy} aria-pressed={!!followed} onClick={toggle}>
      {followed ? `Following ${target.name}` : `Follow ${target.name}`}
    </button>
  );
}

function Follows({ book }: { book: LibraryBook }) {
  const follows = use_data((api) => api.list_follows());
  const authors = book.author_refs.length ? book.author_refs : book.authors.split(",").map((name) => ({ name: name.trim(), bookbrainz_id: "", openlibrary_id: "", hardcover_id: "" }));
  const series = book.series_ref ?? (book.series ? { name: book.series, bookbrainz_id: "", openlibrary_id: "", hardcover_id: "" } : null);
  return (
    <Loaded resource={follows}>
      {(loaded) => (
        <div className="book-follows">
          {authors
            .filter((author) => author.name)
            .map((author) => (
              <FollowButton key={author.name} kind="author" target={author} follows={loaded} />
            ))}
          {series && <FollowButton kind="series" target={series} follows={loaded} />}
        </div>
      )}
    </Loaded>
  );
}

// ── Review ───────────────────────────────────────────────────────────────────

// Saved once the field is left, so each keystroke is not a change in History.
function Review({ book }: { book: LibraryBook }) {
  const [text, set_text] = useState(book.review);
  return (
    <Section title="Review">
      <RichText label="Review" placeholder="What did you think?" value={text} on_change={set_text} on_blur={() => text.trim() !== book.review && attempt(calls().set_book_review(book.id, text))} />
    </Section>
  );
}

// ── Reads ────────────────────────────────────────────────────────────────────

function ReadDialog({ book, read, close }: { book: LibraryBook; read: BookRead | null; close: () => void }) {
  const [started_on, set_started_on] = useState(read?.started_on ?? "");
  const [finished_on, set_finished_on] = useState(read?.finished_on ?? "");
  const [format, set_format] = useState<BookFormat>(read?.format ?? book.format);
  const [dnf, set_dnf] = useState(read?.dnf ?? false);
  return (
    <Dialog
      title={read ? "Change read" : "Add a read"}
      subtitle={book.title}
      on_close={close}
      class_name="read-dialog"
      form={{
        submit_label: "Save",
        on_submit: (event) => {
          event.preventDefault();
          attempt(calls().save_book_read(book.id, { id: read?.id, started_on, finished_on, format, dnf }).then(close));
        },
      }}
    >
      <DateTimeField label="Started" value={started_on || null} on_change={(day) => set_started_on(day ?? "")} />
      <DateTimeField label="Finished" value={finished_on || null} on_change={(day) => set_finished_on(day ?? "")} />
      <Select label="Format" bare options={book_formats.map((each) => [each, book_format_labels[each]] as [BookFormat, string])} value={format} on_change={set_format} />
      <Switch label="Did not finish" checked={dnf} on_change={set_dnf} />
    </Dialog>
  );
}

function open_read(book: LibraryBook, read: BookRead | null): void {
  open_dialog((close) => <ReadDialog book={book} read={read} close={close} />);
}

function read_text(read: BookRead): string {
  const span = read.started_on && read.finished_on ? `${read.started_on} to ${read.finished_on}` : read.finished_on ? `Finished ${read.finished_on}` : read.started_on ? `Started ${read.started_on}, still reading` : "Reading";
  return [span, read.dnf ? "did not finish" : "", read.format ? book_format_labels[read.format] : ""].filter(Boolean).join(" · ");
}

function Reads({ book }: { book: LibraryBook }) {
  return (
    <Section
      title={`Reads (${book.read_count})`}
      tools={
        <button type="button" onClick={() => open_read(book, null)}>
          Add a read
        </button>
      }
    >
      {book.reads.length === 0 ? (
        <Empty title="No reads yet." hint="Starting the book, or adding a read, keeps its days." />
      ) : (
        <ul className="book-list">
          {book.reads.map((read) => (
            <li key={read.id} className="book-row">
              <span>{read_text(read)}</span>
              <button type="button" onClick={() => open_read(book, read)}>
                Change
              </button>
              <button
                type="button"
                aria-label={`Remove the read ${read_text(read)}`}
                onClick={() => confirm_dialog({ title: "Remove this read?", message: read_text(read), confirm_label: "Remove", danger: true, run: () => calls().remove_book_read(read.id) })}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ── Journal ──────────────────────────────────────────────────────────────────

function JournalForm({ book }: { book: LibraryBook }) {
  const [text, set_text] = useState("");
  const [page, set_page] = useState<number | null>(book.progress_unit === "pages" && book.progress ? book.progress : null);
  const [written_on, set_written_on] = useState(today());
  // The field is drawn afresh after a save, since it keeps its own text.
  const [round, set_round] = useState(0);
  return (
    <form
      className="journal-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!text.trim()) return;
        attempt(
          calls()
            .save_journal_entry(book.id, { written_on, page, text })
            .then(() => {
              set_text("");
              set_round(round + 1);
            }),
        );
      }}
    >
      <RichText key={round} label="New journal entry" placeholder="A thought, a quote, where you are…" value={text} on_change={set_text} />
      <div className="journal-form-row">
        <DateTimeField label="Day" value={written_on} on_change={(day) => set_written_on(day ?? today())} />
        <NumberField label="Page" min={1} value={page} on_change={set_page} />
        <button type="submit" disabled={!text.trim()}>
          Add to journal
        </button>
      </div>
    </form>
  );
}

function Journal({ book }: { book: LibraryBook }) {
  const entries = use_data((api) => api.list_book_journal(book.id), [book.id]);
  return (
    <Section title="Journal">
      <JournalForm book={book} />
      <Loaded resource={entries}>
        {(loaded: JournalEntry[]) =>
          loaded.length > 0 && (
            <ul className="journal-list">
              {loaded.map((entry) => (
                <li key={entry.id} className="journal-entry">
                  <div className="book-row">
                    <strong>{[entry.written_on, entry.page ? `p. ${entry.page}` : ""].filter(Boolean).join(" · ")}</strong>
                    <button
                      type="button"
                      aria-label={`Remove the journal entry of ${entry.written_on}`}
                      onClick={() => confirm_dialog({ title: "Remove this journal entry?", message: entry.text.slice(0, 120), confirm_label: "Remove", danger: true, run: () => calls().remove_journal_entry(entry.id) })}
                    >
                      ×
                    </button>
                  </div>
                  <Markdown text={entry.text} />
                </li>
              ))}
            </ul>
          )
        }
      </Loaded>
    </Section>
  );
}

// ── Series ───────────────────────────────────────────────────────────────────

function SeriesList({ series, books }: { series: CatalogSeries; books: LibraryBook[] }) {
  const tracked = (ids: CatalogSeries["books"][number]["ids"]) =>
    books.find((each) => (ids.bookbrainz_id && each.bookbrainz_id === ids.bookbrainz_id) || (ids.openlibrary_id && each.openlibrary_id === ids.openlibrary_id) || (ids.hardcover_id && each.hardcover_id === ids.hardcover_id));
  const add = (ids: CatalogSeries["books"][number]["ids"]) => {
    const [source, id] = ids.bookbrainz_id ? (["bookbrainz", ids.bookbrainz_id] as const) : ids.hardcover_id ? (["hardcover", ids.hardcover_id] as const) : (["openlibrary", ids.openlibrary_id ?? ""] as const);
    attempt(calls().add_book(source, id).then(report_added));
  };
  const read = series.books.filter((entry) => tracked(entry.ids)?.status === "read").length;
  return (
    <Section title={`${series.name} (${read} of ${series.books.length} read)`}>
      <ol className="book-list">
        {series.books.map((entry) => {
          const mine = tracked(entry.ids);
          return (
            <li key={`${entry.position}:${entry.title}`} className="book-row">
              <span className="series-position">{entry.position || "·"}</span>
              {mine ? <a href={book_href(mine.id)}>{entry.title}</a> : <span>{entry.title}</span>}
              {entry.release_date && <span className="muted">{entry.release_date}</span>}
              {mine ? (
                <Badge tone={mine.status === "read" ? "good" : "none"}>{book_status_labels[mine.status]}</Badge>
              ) : (
                (entry.ids.bookbrainz_id || entry.ids.hardcover_id || entry.ids.openlibrary_id) && (
                  <button type="button" onClick={() => add(entry.ids)}>
                    Add
                  </button>
                )
              )}
            </li>
          );
        })}
      </ol>
    </Section>
  );
}

function Series({ book, books }: { book: LibraryBook; books: LibraryBook[] }) {
  // The catalogues are asked once per visit, not after each change.
  const series = use_resource(() => calls().lookup_book_series(book.id), [book.id]);
  if (!book.series && !book.series_ref) return null;
  if (series.status === "loading") return <Skeleton lines={3} />;
  if (series.status === "failed") return <Failure error={series.error} retry={() => void series.reload()} />;
  return series.data ? <SeriesList series={series.data} books={books} /> : null;
}

// ── Page ─────────────────────────────────────────────────────────────────────

function BookPage({ book, collections, books }: { book: LibraryBook; collections: BookCollection[]; books: LibraryBook[] }) {
  const remove = () =>
    confirm_dialog({
      title: `Remove ${book.title}?`,
      message: "Its reads, review and journal go with it; History can bring it back.",
      confirm_label: "Remove",
      danger: true,
      run: async () => {
        await calls().remove_book(book.id);
        window.location.hash = "#/books";
      },
    });

  const length = [book.pages ? `${book.pages} pages` : "", book.audio_minutes ? format_minutes(book.audio_minutes) : ""].filter(Boolean).join(", ");
  return (
    <Stack>
      <PageHeading
        title={book.title}
        subtitle={[book.subtitle, book.authors, book.year].filter(Boolean).join(" · ")}
        actions={
          <button type="button" className="danger" onClick={remove}>
            Remove
          </button>
        }
      />
      <div className="title-head">
        {book.cover_url && <img className="title-poster" src={book.cover_url} alt="" />}
        <div className="title-facts">
          <Facts
            rows={[
              [
                "Status",
                <Select label="Status" bare options={book_statuses.map((status) => [status, book_status_labels[status]] as [string, string])} value={book.status} on_change={(status) => set_book_status(book, status as LibraryBook["status"])} />,
              ],
              ["Rating", <Rating label="Rating" max={10} value={book.rating} on_change={(rating) => attempt(calls().set_book_rating(book.id, rating))} />],
              ["Progress", <Progress book={book} />],
              ["Format", <Select label="Format" bare options={book_formats.map((each) => [each, book_format_labels[each]] as [BookFormat, string])} value={book.format} on_change={(format) => attempt(calls().set_book_format(book.id, format))} />],
              ["Owned", <Switch label="Owned" checked={book.owned} on_change={(owned) => attempt(calls().set_book_owned(book.id, owned))} />],
              !!book.series && ["Series", `${book.series}${book.series_position ? ` #${book.series_position}` : ""}`],
              !!length && ["Length", length],
              !!book.genres && ["Genres", book.genres],
              !!(book.moods || book.pace) && ["Mood", [book.moods, book.pace].filter(Boolean).join(" · ")],
              !!book.isbn && ["ISBN", book.isbn],
              !!book.release_date && ["Released", book.release_date],
              !!book.last_read && ["Last read", book.last_read],
              !!book.added_at && ["Added", book.added_at],
              book_links(book).length > 0 && [
                "Links",
                <span className="book-links">
                  {book_links(book).map((link) => (
                    <a key={link.label} href={link.href} target="_blank" rel="noreferrer">
                      {link.label}
                    </a>
                  ))}
                </span>,
              ],
            ]}
          />
          <Collections book={book} collections={collections} />
          <Follows book={book} />
          {book.overview && <p className="title-overview">{book.overview}</p>}
        </div>
      </div>
      <Review key={book.id} book={book} />
      <Reads book={book} />
      <Journal book={book} />
      <Series book={book} books={books} />
    </Stack>
  );
}

export function BookView({ id }: { id: string }) {
  const book = use_data((api) => api.get_book(id), [id]);
  const library = use_data((api) => api.list_books());
  return (
    <div className="book-page">
      <Loaded resource={book} empty={<Empty title="That book is not in the library." hint={<a href="#/books">Back to Books</a>} />}>
        {(loaded) => loaded && <Loaded resource={library}>{(all) => <BookPage book={loaded} collections={all.collections} books={all.books} />}</Loaded>}
      </Loaded>
    </div>
  );
}
