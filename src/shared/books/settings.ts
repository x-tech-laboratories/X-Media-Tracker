// The books' settings and their defaults, in a file with no imports so the page can read them too.

export const books_setting_defaults = {
  // The status a book added by hand starts with.
  "books.default_status": "want_to_read",
  // How big each cover is in the library's grid: "small", "medium" or "large".
  "books.grid_size": "medium",
  // Whether a StoryGraph import's rating replaces one already set.
  "books.import_overwrite_ratings": false,
  // The fewest hours between checks for new books by the authors and series followed.
  "books.release_check_hours": 24,
  // When the last check ran, as an ISO timestamp, and what it found; synced, so the server and a desktop do not both run it.
  "books.last_release_check": "",
  "books.last_release_result": "",
  // Where the server sends an alert for each new book found: "none", "ntfy", "webhook" or "mail".
  "books.alerts_channel": "none",
  "books.alerts_ntfy_url": "https://ntfy.sh",
  "books.alerts_ntfy_topic": "",
  "books.alerts_ntfy_token": "",
  "books.alerts_webhook_url": "",
  "books.alerts_mail_host": "",
  "books.alerts_mail_port": 587,
  // "starttls", "tls" or "none".
  "books.alerts_mail_security": "starttls",
  "books.alerts_mail_username": "",
  "books.alerts_mail_password": "",
  "books.alerts_mail_from": "",
  "books.alerts_mail_to": "",
};

// Settings that hold another service's key or a private address, kept out of what other programs read.
export const books_secret_settings = ["books.alerts_ntfy_topic", "books.alerts_ntfy_token", "books.alerts_webhook_url", "books.alerts_mail_password"];
