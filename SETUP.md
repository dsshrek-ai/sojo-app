# Setup Guide

Backed by **MyDataWorld**, the same shared database as My Apps Hub, T-Minus,
Shed Inventory, PWI Weight Tracker, Choir Admin Panel, and the cookbook
apps. The roster data itself stays exactly where it's always been — a
Google Sheet via `Code.gs` — this only replaces the shared 4-digit PIN with
a real per-person login.

## 1. Update the database

Open **phpMyAdmin**, select the MyDataWorld database, go to the **SQL** tab,
and run everything in [`api/schema.sql`](api/schema.sql). It's safe to run
even if `users`/`sessions` already exist — those use
`CREATE TABLE IF NOT EXISTS`. This also requires My Apps Hub's own
`api/schema.sql` to have already been run at least once (a `sojo-membership`
row must already exist in `apps`).

## 2. Deploy the API

1. Copy `api/config.example.php` to `api/config.php` and fill in:
   - `DB_NAME`, `DB_USER`, `DB_PASS` — same credentials as your other
     MyDataWorld apps
   - `APPS_SCRIPT_URL` — the same Google Apps Script Web App URL that's
     currently hardcoded in `app.js`
   - `ADMIN_PIN` — the current value of `Code.gs`'s `ADMIN_PIN` constant
2. Upload the whole `api/` folder via FTP/File Manager — e.g.
   `seniorfamily.org/sojo-api/`.

## 3. Point the app at your API

In `app.js`:

```js
const API_URL = 'https://seniorfamily.org/sojo-api/api.php';
```

## 4. Publish

Push this repo (GitHub Pages) or upload the files directly to
seniorfamily.org — same as before.

## 5. Grant access

1. Sign up through **My Apps Hub** with your email, if you haven't already.
2. Open the Hub's `admin.html`, look yourself up, and check the box next to
   **SOJO Membership** (a private app — checking the box is what lets you
   in at all, same as any other private app there). Repeat for any section
   leaders who use this.
3. There's no more PIN to share — access is per-person now. Changing (or
   removing) someone's access no longer means changing a PIN everyone else
   also has to relearn.

## Single sign-on

If `apps.sso_enabled = 1` is set for `sojo-membership`, launching this app
from My Apps Hub logs it in automatically (`?token=...` handoff). The login
is session-scoped (`sessionStorage`, not `localStorage`), same as the PIN
it replaces — it clears itself when the browser tab closes, since this app
shows real member data (home addresses, phone numbers, emails) and may run
on a shared computer.

## Notes

- `Code.gs` is completely unchanged — same Sheet, same actions, same PIN
  check server-side. `api/api.php` is a thin layer in front of it that
  swaps "does the browser know the PIN" for "is this a logged-in,
  authorized MyDataWorld account," then injects the real PIN itself before
  forwarding the request.
- Every action now requires login, including the read-only ones
  (`getConfig`/`getSingers`/`getSinger`) — unlike some other apps here,
  the whole directory used to sit behind the PIN, not just editing, so SSO
  replaces the gate for both.
