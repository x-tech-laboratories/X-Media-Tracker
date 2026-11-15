// Alerts for new books by the authors and series followed, sent by the server alone through the channel Settings → Books
// names, so each book found on any device is announced once.

// ── Imports ──────────────────────────────────────────────────────────────────

import { send_mail, mail_settings } from "@x-tech-laboratories/x-libs/server/notify/mail";
import { send_ntfy, ntfy_settings } from "@x-tech-laboratories/x-libs/server/notify/ntfy";
import { send_webhook, webhook_settings } from "@x-tech-laboratories/x-libs/server/notify/webhook";

import type { Release } from "../shared/books/model.ts";
import type { MediaMethods } from "../shared/store.ts";

// ── Messages ─────────────────────────────────────────────────────────────────

export interface BookAlert {
  title: string;
  text: string;
  link: string;
}

export function alert_of(release: Release): BookAlert {
  const series = release.series ? `${release.series}${release.series_position ? ` #${release.series_position}` : ""}` : "";
  return {
    title: `New book: ${release.title}`,
    text: [release.authors && `By ${release.authors}`, series, release.release_date && `Out ${release.release_date}`].filter(Boolean).join(" · "),
    link: release.hardcover_id ? `https://hardcover.app/id/book/${release.hardcover_id}` : release.openlibrary_id ? `https://openlibrary.org/works/${release.openlibrary_id}` : "",
  };
}

// ── Sending ──────────────────────────────────────────────────────────────────

export type SendAlert = (settings: Record<string, unknown>, release: Release) => Promise<void>;

function channel_settings(settings: Record<string, unknown>, prefix: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(settings).filter(([key]) => key.startsWith(prefix)).map(([key, value]) => [key.slice(prefix.length), value]));
}

export const alert_senders: Record<string, SendAlert> = {
  ntfy: async (settings, release) => {
    const alert = alert_of(release);
    await send_ntfy(ntfy_settings(channel_settings(settings, "books.alerts_ntfy_")), { title: alert.title, message: alert.text, tags: ["books"], click: alert.link || null });
  },
  webhook: async (settings, release) => {
    const alert = alert_of(release);
    const body = { title: release.title, authors: release.authors, series: release.series, series_position: release.series_position, release_date: release.release_date, link: alert.link };
    await send_webhook(webhook_settings(channel_settings(settings, "books.alerts_webhook_")), { values: { ...body, message: `${alert.title}. ${alert.text}` }, default_body: body });
  },
  mail: async (settings, release) => {
    const alert = alert_of(release);
    await send_mail(mail_settings(channel_settings(settings, "books.alerts_mail_")), { subject: alert.title, text: [alert.text, alert.link].filter(Boolean).join("\n\n") });
  },
};

// Sends one alert per book found since the last; with no channel set they are only shown in the app, so none piles up for
// a channel set later. A book whose alert fails is tried again next time.
export async function send_book_alerts(methods: MediaMethods, senders: Record<string, SendAlert> = alert_senders): Promise<{ sent: number; failed: number }> {
  const releases = await methods.list_unnotified_releases();
  if (releases.length === 0) return { sent: 0, failed: 0 };
  const settings = await methods.get_settings();
  const send = senders[String(settings["books.alerts_channel"])];
  if (!send) {
    await methods.mark_releases_notified(releases.map((release) => release.id));
    return { sent: 0, failed: 0 };
  }
  const sent: string[] = [];
  let failed = 0;
  for (const release of releases) {
    try {
      await send(settings, release);
      sent.push(release.id);
    } catch (error) {
      failed++;
      console.warn(`book alert for ${release.title}:`, (error as Error).message);
    }
  }
  if (sent.length) await methods.mark_releases_notified(sent);
  return { sent: sent.length, failed };
}
