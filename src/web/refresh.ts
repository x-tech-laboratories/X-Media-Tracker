// Following a refresh that runs on its own wherever the data is kept, such as fetching every game's details again: the
// page asks how it goes each second while it runs, including one already running when the page opens, and reports it
// once it ends.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";

import { data_watch } from "./api.ts";

// ── Refresh ──────────────────────────────────────────────────────────────────

export interface RefreshProgress<Report> {
  state: "none" | "running" | "done" | "failed";
  done: number;
  total: number;
  report: Report | null;
  error: string;
}

const poll_milliseconds = 1000;

export function use_refresh<Report, Progress extends RefreshProgress<Report>>(
  get: () => Promise<Progress>,
  begin: () => Promise<Progress>,
  report_text: (report: Report) => string,
): { refresh: Progress | null; start: () => void } {
  const [refresh, set_refresh] = useState<Progress | null>(null);

  // Only a refresh seen running is reported, so opening the page after one ended says nothing.
  const follow = (next: Progress): void => {
    set_refresh(next);
    if (next.state === "running") return;
    data_watch.bump();
    if (next.state === "done" && next.report) toast(report_text(next.report), { tone: "good" });
    if (next.state === "failed") toast(`Could not refresh: ${next.error}`, { tone: "bad" });
  };

  useEffect(() => {
    let live = true;
    void get()
      .then((first) => {
        if (live) set_refresh(first);
      })
      .catch(() => undefined);
    return () => void (live = false);
  }, []);

  useEffect(() => {
    if (refresh?.state !== "running") return;
    let live = true;
    const timer = setTimeout(() => {
      void get()
        .then((next) => {
          if (live) follow(next);
        })
        .catch((error: unknown) => {
          if (!live) return;
          set_refresh(null);
          toast((error as Error).message, { tone: "bad" });
        });
    }, poll_milliseconds);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [refresh]);

  const start = (): void => {
    begin()
      .then(follow)
      .catch((error: unknown) => toast((error as Error).message, { tone: "bad" }));
  };

  return { refresh, start };
}
