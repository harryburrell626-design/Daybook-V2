# Daybook

A private personal finance & life journal. Every evening you record your money, then capture your day:
how it felt, sleep, screen time, what you did, a song, a film, a photo.

* **Finances** (background): transactions, recurring bills & fixed income, budgets, savings pots, assets & debts, net worth.
* **Daily Log** (the heart): a guided end-of-day flow (3–5 minutes), or one whole page per day. Autosaves.
* **Calendar**: browse any day, photos, songs/films/books, "on this day".
* **Insights**: gentle patterns across mood, sleep, screens, activities and spending.

## Requirements
* Node.js 20+
* PostgreSQL **15 or newer** (row-level security + `ON DELETE SET NULL (col)`)

## Run it locally
```bash
npm install
docker compose up -d                     # or use any PostgreSQL 15+ you already have
cp .env.example .env                     # then edit the passwords / PG_SUPERUSER_URL
npm run setup-db                         # creates the database, 3 roles, tables and security policies
npm start                                # http://localhost:3000
```
Create an account on the login screen. Tick "Start with fictional demo data" to look around; clear it any time
from the banner or Settings.

**Password reset email:** set `RESEND_API_KEY` + `MAIL_FROM` (resend.com) to send real emails. Without it the link is
printed in the server log, and with `DEV_SHOW_RESET_LINK=1` (local only, ignored in production) it is also shown on screen.

## Deploying
Serve over HTTPS (Render, Fly, Railway, a VPS + Caddy…), set `NODE_ENV=production` (Secure cookies + HSTS),
`TRUST_PROXY=1` behind a proxy, `APP_URL=https://your.domain`, and strong unique values for the three `DB_*_PASSWORD`s.
Remove `DEV_SHOW_RESET_LINK`. Back up the database (or use Settings → Download full backup).

## Hosting for free (Render + Neon)
1. Put the project in a GitHub repository (upload the unzipped files at github.com → New repository → "uploading an existing file").
2. **Neon** (neon.com): create a free project and copy its connection string (starts `postgresql://`).
3. **Render** (render.com): New → Blueprint → pick the repository. When asked, paste the Neon string as `ADMIN_DATABASE_URL`.
   `APP_SECRET` is generated for you. Daybook creates its own restricted database accounts and tables on first start.
4. Open the `https://….onrender.com` address Render gives you and create your account (untick demo data for real use).

Free-tier notes: Render's free web service sleeps after 15 minutes idle (about a minute to wake); Neon's free database is 1 GB.
Password-reset emails need `RESEND_API_KEY` + `MAIL_FROM`; without them the reset link appears in Render's log.
Keep a regular backup from Settings → Download full backup.

### Using Supabase instead of Neon
Create a free Supabase project (choose a simple password with letters and numbers only). Click **Connect** → copy the **Transaction pooler**
connection string (host ends `pooler.supabase.com`, user looks like `postgres.abcdefgh`), replace `[YOUR-PASSWORD]` with your database password,
and use it as `ADMIN_DATABASE_URL` on Render. Use the pooler, not the "Direct connection": direct connections are IPv6-only and Render can't reach them.
Daybook locks the `anon` / `authenticated` API roles out of its tables, and keeps all its tables private even though Supabase offers a public data API.
The connection is encrypted; Supabase's pooler certificate isn't verified because Node doesn't trust its CA by default.
Free Supabase projects may pause after about a week without use (you can restore them from the dashboard).

## How privacy is enforced
* Real accounts: email + password, hashed with **scrypt** (per-password salt). Sessions are random tokens in an
  `HttpOnly`, `SameSite=Lax` cookie; only a SHA-256 of the token is stored. Login/reset/signup are rate-limited.
  Reset tokens are single-use, expire in 1 hour, and sign out every device.
* **Row-level security in PostgreSQL.** Every data table has `FORCE ROW LEVEL SECURITY` with a policy
  `user_id = app_user_id()`. Each request runs in a transaction that sets `app.user_id` from the verified session, so
  even a bug in an API route can't return another person's rows.
* **Three database roles**: `daybook_owner` (migrations only), `daybook_auth` (can only touch users/sessions/resets),
  `daybook_app` (user data only, not a superuser, cannot bypass RLS, cannot read users/sessions at all).
* Photos live in the database behind the same policy and are served only through an authenticated endpoint.
* CSRF: state-changing requests need a custom header + same-origin check. Strict CSP, no inline scripts, all
  user text is inserted as text (never HTML). Uploads are verified by file signature and re-encoded in the browser.

`npm test` (server running; start it with `RATE_LIMIT_DISABLED=1` to allow repeated test runs) runs 56 checks covering all of the above, including direct database access as a second user.

## Layout
```
db/schema.sql            tables, RLS policies, privileges (idempotent)
scripts/setup-db.js      creates roles + database and applies the schema
server/                  Express API: auth.js, routes.js, validate.js, recurring.js, demo.js
public/                  no-build frontend (ES modules): js/views/*, js/store.js, css/styles.css
tests/security.test.js   authentication + isolation + backup/restore tests
```
To extend: add a table with a `user_id` column + the RLS policy (add its name to the list in `schema.sql`), a validator in
`validate.js`, a route in `routes.js`, and a view in `public/js/views/`.

## Notes
* Money moved into a savings pot leaves your *available balance* (and returns on withdrawal), so net worth is unchanged:
  `net worth = available balance + savings pots + assets − debts`.
* Recurring items post real transactions on their due date (the server catches up whenever you open the app).
  Deleting a recurring item keeps what it already posted. Editing a single posted transaction affects only that one.
* The demo data is entirely fictional and flagged separately, so clearing it never touches your own entries.
