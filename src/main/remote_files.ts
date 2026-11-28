// Where a server serves a file by GET under its API, such as a kept cover or a plugin's page side.

// A daemon's address, such as "https://media.example.org", and a path under its /api/, each part of the path escaped.
export function remote_file_url(address: string, path: string): string {
  const escaped = path.split("/").map((part) => encodeURIComponent(part)).join("/");
  return `${address.replace(/\/+$/, "")}/api/${escaped}`;
}
