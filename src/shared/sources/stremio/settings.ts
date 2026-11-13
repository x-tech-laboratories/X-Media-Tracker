// The Stremio plugin's settings, in a file with no imports so the page can read them too.

export const stremio_setting_defaults = {
  // The account signed in as, shown on the Import page.
  "stremio.email": "",
  // Filled in by signing in; the password is never kept.
  "stremio.auth_key": "",
};

export const stremio_secret_settings = ["stremio.auth_key"];
