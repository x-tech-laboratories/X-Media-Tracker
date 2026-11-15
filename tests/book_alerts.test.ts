import { DatabaseSync } from "node:sqlite";

import { describe, expect, it, vi } from "vitest";

import { alert_of, send_book_alerts, type SendAlert } from "../src/server/book_alerts.ts";
import type { Release } from "../src/shared/books/model.ts";
import { bind_methods, open_store } from "../src/shared/store.ts";

// ── Setup ────────────────────────────────────────────────────────────────────

function open_methods() {
  const database = new DatabaseSync(":memory:");
  open_store(database);
  database.exec("INSERT INTO books_follows (id, kind, name, openlibrary_id, followed_at, checked_at) VALUES ('author:openlibrary:OL1A', 'author', 'Brandon Sanderson', 'OL1A', '2026-11-01', '2026-11-01')");
  const add = database.prepare("INSERT INTO books_releases (id, follow_id, title, authors, series, series_position, release_date, openlibrary_id, found_at, notified_at) VALUES (?, 'author:openlibrary:OL1A', ?, 'Brandon Sanderson', ?, ?, ?, ?, '2026-11-15', ?)");
  add.run("openlibrary:OL2W", "Ghostbloods", "Ghostbloods", "1", "2027-03-01", "OL2W", "");
  add.run("openlibrary:OL3W", "Elantris 2", "", "", "2028-01-01", "OL3W", "");
  add.run("openlibrary:OL4W", "Old News", "", "", "2026-01-01", "OL4W", "2026-11-01");
  return bind_methods(() => database, () => undefined);
}

// ── Alerts ───────────────────────────────────────────────────────────────────

describe("book alerts", () => {
  it("words an alert with the authors, series and day, linking the book", () => {
    const release = { title: "Ghostbloods", authors: "Brandon Sanderson", series: "Ghostbloods", series_position: "1", release_date: "2027-03-01", openlibrary_id: "OL2W", hardcover_id: "" } as Release;

    expect(alert_of(release)).toEqual({ title: "New book: Ghostbloods", text: "By Brandon Sanderson · Ghostbloods #1 · Out 2027-03-01", link: "https://openlibrary.org/works/OL2W" });
  });

  it("sends each new book once through the channel set, and tries a failed one again next time", async () => {
    const store = open_methods();
    store.set_setting("books.alerts_channel", "ntfy");
    const send = vi.fn<SendAlert>(async (_settings, release) => {
      if (release.title === "Elantris 2") throw new Error("HTTP 500: busy");
    });

    expect(await send_book_alerts(store, { ntfy: send })).toEqual({ sent: 1, failed: 1 });
    expect(send.mock.calls.map(([, release]) => release.title).sort()).toEqual(["Elantris 2", "Ghostbloods"]);
    expect(store.list_unnotified_releases().map((release) => release.title)).toEqual(["Elantris 2"]);

    send.mockImplementation(async () => undefined);
    expect(await send_book_alerts(store, { ntfy: send })).toEqual({ sent: 1, failed: 0 });
    expect(store.list_unnotified_releases()).toEqual([]);
  });

  it("only marks the books as handled when no channel is set, so none pile up", async () => {
    const store = open_methods();
    const send = vi.fn<SendAlert>(async () => undefined);

    expect(await send_book_alerts(store, { ntfy: send })).toEqual({ sent: 0, failed: 0 });
    expect(send).not.toHaveBeenCalled();
    expect(store.list_unnotified_releases()).toEqual([]);
  });
});
