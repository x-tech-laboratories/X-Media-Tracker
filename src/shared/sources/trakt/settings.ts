// The Trakt plugin's settings, in a file with no imports so the page can read them too.

export const trakt_setting_defaults = {
  // The Client ID and Secret of the user's own Trakt API app, from trakt.tv/oauth/applications.
  "trakt.client_id": "",
  "trakt.client_secret": "",
  // Filled in by signing in, and renewed on their own.
  "trakt.access_token": "",
  "trakt.refresh_token": "",
  // Unix seconds.
  "trakt.expires_at": 0,
};

export const trakt_secret_settings = ["trakt.client_secret", "trakt.access_token", "trakt.refresh_token"];
