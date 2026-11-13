// Stremio's API: signing in for an auth key, and reading the whole library. Nothing is ever written to Stremio.

// ── Requests ─────────────────────────────────────────────────────────────────

const api_base = "https://api.strem.io/api";

type Fetch = typeof fetch;

type Json = Record<string, unknown>;

async function post(fetcher: Fetch, path: string, body: unknown): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(`${api_base}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Stremio could not be reached.");
  }
  let json: Json;
  try {
    json = (await response.json()) as Json;
  } catch {
    throw new Error(`Stremio answered unexpectedly (HTTP ${response.status}).`);
  }
  const error = json.error as { message?: string } | undefined;
  if (error) throw new Error(`Stremio: ${error.message ?? "it refused the request"}`);
  return json.result;
}

// The password is sent once for the key and kept nowhere.
export async function stremio_sign_in(email: string, password: string, fetcher: Fetch = fetch): Promise<string> {
  if (!email.trim() || !password) throw new Error("Enter your Stremio email and password.");
  const result = (await post(fetcher, "login", { type: "Login", email: email.trim(), password })) as Json | null;
  const key = String(result?.authKey ?? "");
  if (!key) throw new Error("Stremio gave no auth key.");
  return key;
}

export async function read_stremio_library(auth_key: string, fetcher: Fetch = fetch): Promise<Json[]> {
  const result = await post(fetcher, "datastoreGet", { authKey: auth_key, collection: "libraryItem", ids: [], all: true });
  return Array.isArray(result) ? (result as Json[]) : [];
}
