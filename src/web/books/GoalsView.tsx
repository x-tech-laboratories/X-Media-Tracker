// Goals & stats: a year's reading goal and how far along it is against an even pace, then that year's books and pages
// by month, ratings, formats and top genres.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useState } from "react";
import { BarChart, Donut } from "@x-tech-laboratories/x-libs/web/react/charts";
import { NumberField } from "@x-tech-laboratories/x-libs/web/react/controls";
import { PageHeading, Section, SettingRow, Stack, Tile, Tiles } from "@x-tech-laboratories/x-libs/web/react/layout";
import { ProgressBar } from "@x-tech-laboratories/x-libs/web/react/progress";
import { Loaded } from "@x-tech-laboratories/x-libs/web/react/states";
import { today } from "@x-tech-laboratories/x-libs/dates";

import { calls, use_data } from "../api.ts";
import { book_format_labels, format_minutes, goal_pace, is_book_format } from "../../shared/books/model.ts";
import type { ReadingYear } from "../../shared/books/store.ts";
import { attempt } from "./actions.tsx";

// ── Charts ───────────────────────────────────────────────────────────────────

const month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const series_colors = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)", "var(--series-6)"];

const whole = (value: number) => String(Math.round(value));

function Goal({ year, reading }: { year: number; reading: ReadingYear }) {
  const { goal, stats } = reading;
  const pace = goal ? goal_pace(goal, year, today()) : 0;
  const ahead = stats.finished - pace;
  return (
    <Section title="Goal">
      <SettingRow label={`Books to finish in ${year}`} hint="Every finished read counts, a book read twice twice.">
        <NumberField label={`Books to finish in ${year}`} bare min={0} unit="books" value={goal} on_change={(target) => attempt(calls().set_reading_goal(year, target))} />
      </SettingRow>
      {goal !== null && (
        <ProgressBar
          label="Reading goal"
          value={Math.min(stats.finished, goal)}
          max={goal}
          detail={`${stats.finished} of ${goal} books${pace ? `, ${ahead >= 0 ? `${ahead} ahead of` : `${-ahead} behind`} an even pace` : ""}`}
        />
      )}
    </Section>
  );
}

function Stats({ reading }: { reading: ReadingYear }) {
  const { stats } = reading;
  const formats = Object.entries(stats.formats).map(([format, count], index) => ({ label: is_book_format(format) && format ? book_format_labels[format] : "Not said", value: count, color: series_colors[index % series_colors.length]! }));
  const ratings = Array.from({ length: 10 }, (_, index) => ({ label: `★ ${index + 1}`, value: stats.ratings[index + 1] ?? 0, color: "var(--series-2)" }));
  return (
    <>
      <Tiles>
        <Tile label="Books finished" value={stats.finished} />
        <Tile label="Pages" value={stats.pages.toLocaleString()} />
        <Tile label="Listened" value={stats.audio_minutes ? format_minutes(stats.audio_minutes) : "—"} />
        <Tile label="Average rating" value={stats.average_rating ? `★ ${stats.average_rating.toFixed(1)}` : "—"} />
        <Tile label="Did not finish" value={stats.dnf} />
      </Tiles>
      <Section title="Books by month">
        <BarChart title="Books finished by month" bars={stats.books_by_month.map((value, index) => ({ label: month_names[index]!, value, color: "var(--series-1)" }))} format={whole} />
      </Section>
      <Section title="Pages by month">
        <BarChart title="Pages read by month" bars={stats.pages_by_month.map((value, index) => ({ label: month_names[index]!, value, color: "var(--series-3)" }))} format={whole} />
      </Section>
      <Section title="Ratings">
        <BarChart title="Ratings given" bars={ratings} format={whole} />
      </Section>
      <Section title="Formats">
        <Donut title="Formats read" parts={formats} center={String(stats.finished)} center_label="books" message="No books finished this year." />
      </Section>
      {stats.genres.length > 0 && (
        <Section title="Top genres">
          <BarChart title="Top genres" bars={stats.genres.map(([genre, count]) => ({ label: genre, value: count, color: "var(--series-4)" }))} format={whole} />
        </Section>
      )}
    </>
  );
}

export function GoalsView() {
  const [year, set_year] = useState(Number(today().slice(0, 4)));
  const reading = use_data((api) => api.get_reading_year(year), [year]);
  return (
    <div className="books-page">
      <Stack>
        <PageHeading
          title={`Reading in ${year}`}
          actions={
            <>
              <button type="button" className="icon" aria-label="The year before" onClick={() => set_year(year - 1)}>
                ‹
              </button>
              <button type="button" className="icon" aria-label="The year after" onClick={() => set_year(year + 1)}>
                ›
              </button>
            </>
          }
        />
        <Loaded resource={reading}>
          {(loaded) => (
            <>
              <Goal year={year} reading={loaded} />
              <Stats reading={loaded} />
            </>
          )}
        </Loaded>
      </Stack>
    </div>
  );
}
