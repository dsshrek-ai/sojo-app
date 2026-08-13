# SOJO Directory

A singer roster/directory for the SOJO Choral Arts Group — search, browse by
section/position, see contact info, take attendance, and flag members who
need follow-up. Data lives on a Google Sheet via `Code.gs`, unchanged.

See [SETUP.md](SETUP.md) for deployment (database, API, granting access).

## Files

- `index.html`, `app.js`, `style.css`, `sw.js`, `manifest.json` — the app
- `Code.gs` — the existing Google Apps Script backend (reads/writes the
  roster Sheet) — untouched by the SSO migration
- `api/api.php` — thin auth proxy in front of `Code.gs`: validates a
  MyDataWorld login + `app_access` grant, then forwards the request with
  the real PIN injected server-side. The browser never sees the PIN again.
- `api/schema.sql` — no new tables; documents the shared `users`/`sessions`
  tables this depends on (from My Apps Hub's own schema)
- `api/config.example.php` — copy to `api/config.php` with real DB
  credentials, the Apps Script URL, and the admin PIN (gitignored)

## Accounts

No signup here — this shares the same login as My Apps Hub, T-Minus, Shed
Inventory, PWI Weight Tracker, Choir Admin Panel, and the cookbook apps
(all on MyDataWorld). Sign up through My Apps Hub, then ask to be granted
access to "SOJO Membership."

## What changed vs. what didn't

The single shared 4-digit PIN — which used to gate the *entire* app,
viewing included, not just editing — is gone from the browser entirely.
Logging in now requires a real MyDataWorld account with an `app_access`
grant for `sojo-membership`. `Code.gs` itself, and everything it does with
the Sheet, is completely unchanged; `api/api.php` just stands in front of
it and supplies the PIN itself on every request.

## Single sign-on

If `apps.sso_enabled = 1` is set for `sojo-membership` in My Apps Hub's
database, launching this app from the Hub logs it in automatically
(`?token=...` handoff).
