// Trakt's API: signing in by device code, renewing the token, reading every page of a list, and removing one watch
// from its history. Trakt wants a User-Agent on every call, or Cloudflare refuses it before it reaches Trakt.

// ── Shapes ───────────────────────────────────────────────────────────────────

export interface TraktCredentials {
  client_id: string;
  client_secret: string;
  access_token: string;
  refresh_token: string;
  // Unix seconds; 0 when unknown.
  expires_at: number;
}

export interface TraktTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export interface DeviceCode {
  device_code: string;
  user_code: string;
  verification_url: string;
  expires_in: number;
  interval: number;
}

export type PollState = { state: "authorized"; tokens: TraktTokens } | { state: "pending" } | { state: "slow_down" };

type Fetch = typeof fetch;

type Json = Record<string, unknown>;

// ── Requests ─────────────────────────────────────────────────────────────────

const api_base = "https://api.trakt.tv";
const user_agent = "x-media-tracker/1.0";
const page_limit = 100;
// A page count Trakt misreports cannot keep a read going for ever.
const most_pages = 500;
// Renewed a little early, so a long import does not run out mid-way.
const renew_seconds_early = 300;

// A Client ID pasted from Trakt's site often carries a stray space or newline, which Trakt reads as a wrong one.
function trimmed(credentials: TraktCredentials): TraktCredentials {
  return { ...credentials, client_id: credentials.client_id.trim(), client_secret: credentials.client_secret.trim() };
}

function headers_of(credentials: TraktCredentials, signed_in: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": user_agent,
    "Content-Type": "application/json",
    "trakt-api-version": "2",
    "trakt-api-key": credentials.client_id.trim(),
  };
  if (signed_in) headers.Authorization = `Bearer ${credentials.access_token}`;
  return headers;
}

function tokens_of(json: Json): TraktTokens {
  return {
    access_token: String(json.access_token ?? ""),
    refresh_token: String(json.refresh_token ?? ""),
    expires_at: Number(json.created_at ?? 0) + Number(json.expires_in ?? 0),
  };
}

// Trakt's own words where it gives them, and plain advice for the refusals that are easy to misread.
async function refusal(response: Response, client_id: string): Promise<string> {
  const raw = await response.text().catch(() => "");
  let detail = raw.trim().slice(0, 200);
  try {
    const body = JSON.parse(raw) as Json;
    detail = String(body.error_description ?? body.error ?? "");
  } catch {
    // A plain-text body, such as "Forbidden", is the detail itself.
  }
  if (response.status === 401 && detail === "client not found") {
    return `Trakt does not recognise this Client ID. Copy the Client ID, not the Client Secret, from trakt.tv/oauth/applications, and all of it (it is now ${client_id.length} characters).`;
  }
  if (response.status === 403) return "Trakt refused the Client ID (HTTP 403). Check it against your app at trakt.tv/oauth/applications.";
  if (response.status === 401) return "Trakt's sign-in has run out (HTTP 401). Sign in to Trakt again.";
  return detail ? `Trakt refused the request: ${detail} (HTTP ${response.status})` : `Trakt refused the request (HTTP ${response.status})`;
}

async function send(fetcher: Fetch, path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetcher(`${api_base}${path}`, init);
  } catch {
    throw new Error("Trakt could not be reached.");
  }
}

// ── Client ───────────────────────────────────────────────────────────────────

export interface TraktClient {
  start_device_sign_in: () => Promise<DeviceCode>;
  poll_device_sign_in: (device_code: string) => Promise<PollState>;
  // New tokens when the current ones are about to run out, else null.
  renew_if_needed: (now_seconds: number) => Promise<TraktTokens | null>;
  read_all: (path: string) => Promise<Json[]>;
  remove_history_entry: (history_id: number) => Promise<void>;
}

export function create_trakt(given: TraktCredentials, fetcher: Fetch = fetch): TraktClient {
  const credentials = trimmed(given);
  if (!credentials.client_id) throw new Error("Set a Trakt Client ID first.");

  const post = (path: string, body: unknown, signed_in = false) => send(fetcher, path, { method: "POST", headers: headers_of(credentials, signed_in), body: JSON.stringify(body) });

  return {
    start_device_sign_in: async () => {
      const response = await post("/oauth/device/code", { client_id: credentials.client_id });
      if (!response.ok) throw new Error(await refusal(response, credentials.client_id));
      const json = (await response.json()) as Json;
      return {
        device_code: String(json.device_code ?? ""),
        user_code: String(json.user_code ?? ""),
        verification_url: String(json.verification_url ?? ""),
        expires_in: Number(json.expires_in ?? 0),
        interval: Number(json.interval ?? 5),
      };
    },

    // Each of Trakt's answers to the device flow is its own state, so the page can say what happened.
    poll_device_sign_in: async (device_code) => {
      if (!credentials.client_secret) throw new Error("Set a Trakt Client Secret first.");
      const response = await post("/oauth/device/token", { code: device_code, client_id: credentials.client_id, client_secret: credentials.client_secret });
      if (response.status === 200) return { state: "authorized", tokens: tokens_of((await response.json()) as Json) };
      if (response.status === 400) return { state: "pending" };
      if (response.status === 429) return { state: "slow_down" };
      if (response.status === 404) throw new Error("That code is not valid. Start again.");
      if (response.status === 409) throw new Error("That code was already used. Start again.");
      if (response.status === 410) throw new Error("The code ran out. Start again.");
      if (response.status === 418) throw new Error("Trakt was told no.");
      throw new Error(`Trakt answered unexpectedly (HTTP ${response.status}).`);
    },

    renew_if_needed: async (now_seconds) => {
      if (!credentials.refresh_token || credentials.expires_at === 0 || now_seconds < credentials.expires_at - renew_seconds_early) return null;
      const response = await post("/oauth/token", {
        refresh_token: credentials.refresh_token,
        client_id: credentials.client_id,
        client_secret: credentials.client_secret,
        grant_type: "refresh_token",
      });
      if (!response.ok) throw new Error("Trakt's sign-in ran out and could not be renewed. Sign in to Trakt again.");
      return tokens_of((await response.json()) as Json);
    },

    // Trakt says how many pages there are in X-Pagination-Page-Count; every one is read.
    read_all: async (path) => {
      const rows: Json[] = [];
      let page = 1;
      let page_count = 1;
      do {
        const joiner = path.includes("?") ? "&" : "?";
        const response = await send(fetcher, `${path}${joiner}page=${page}&limit=${page_limit}`, { headers: headers_of(credentials, true) });
        if (!response.ok) throw new Error(`${await refusal(response, credentials.client_id)} (${path})`);
        const batch = (await response.json()) as unknown;
        if (Array.isArray(batch)) rows.push(...(batch as Json[]));
        page_count = Number(response.headers.get("x-pagination-page-count")) || 1;
        page++;
      } while (page <= page_count && page <= most_pages);
      return rows;
    },

    // By Trakt's own history id, which names exactly one play; a title and time could name several.
    remove_history_entry: async (history_id) => {
      const response = await post("/sync/history/remove", { ids: [history_id] }, true);
      if (!response.ok) throw new Error(await refusal(response, credentials.client_id));
      const body = (await response.json().catch(() => ({}))) as { not_found?: { ids?: unknown[] } };
      if ((body.not_found?.ids ?? []).length > 0) throw new Error("Trakt does not know that watch; it may already be gone.");
    },
  };
}
