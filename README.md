# Alex & Joanna wedding site

Private wedding website for Alex and Joanna, 28 August 2027.

The site has one scrolling wedding page (Home, The Day, Locations, Getting There, Where to Stay, FAQ, RSVP), personal invitation links, RSVPs with optional plus-ones and menu choices, and an admin area for guests, content, menu and settings. Admins sign in with Neon Auth magic links. Guests have no accounts.

Stack: Next.js 16 (App Router), TypeScript, Tailwind CSS 4, Neon Postgres, Neon Auth (`@neondatabase/auth`), Drizzle ORM, Vitest, Playwright, GitHub Actions.

## Routes

| Route | What it does |
| --- | --- |
| `/` | The wedding page. Private mode: invitation-only screen unless the browser has a guest session. Public mode: general information for anyone; the RSVP form still needs a guest session |
| `/invite/[token]` | Exchanges an invitation token for a guest session cookie, then redirects to `/` |
| `/invitation-not-found` | Shown for any link that doesn't work (unknown, replaced, archived or malformed) |
| `/admin/login` | Email-only form that requests a magic link |
| `/admin` | Dashboard: counts, deadline, access mode, "Preview wedding site" |
| `/admin/guests`, `/admin/guests/[id]` | Guest list with search and filters; guest page with edit, invitation link, RSVP editor, archive/restore, "Preview as guest" |
| `/admin/guests/[id]/preview` | The site as that guest sees it, read-only |
| `/admin/preview` | The site with general content only, whatever the access mode |
| `/admin/families`, `/admin/import`, `/admin/content`, `/admin/menu`, `/admin/settings` | Family groups, CSV import, page copy and FAQ, menu options, site settings |
| `/admin/export` | CSV download of all guests and RSVPs |
| `/api/auth/*` | Proxy to Neon Auth (see "How admin auth works") |

Every `/admin` page, action and the export check for a verified, allowlisted admin on the server.

## Requirements

- Node.js 24 (see `.nvmrc`; `nvm use` picks it up)
- npm (lockfile is `package-lock.json`)

## Local setup

```bash
npm install
npm i -g neon@latest && neon auth                                    # Neon CLI, once per machine
neon link --project-id wild-cloud-37283675 --branch development -y   # writes .neon and pulls Neon vars into .env.local
# add NEON_AUTH_COOKIE_SECRET and ADMIN_EMAILS to .env.local, see below
DATABASE_URL="$(grep '^DATABASE_URL_UNPOOLED=' .env.local | cut -d= -f2- | tr -d '"')" npm run db:migrate
npm run dev                  # http://localhost:3000
```

Local development always uses the Neon `development` branch. Never link your working copy to `production`.

The app refuses to build or start if any required variable is missing or malformed. The error names the variable but never prints its value.

## Environment variables

The app requires four variables everywhere. Two come from Neon, two you set yourself.

| Variable | Source |
| --- | --- |
| `DATABASE_URL` | Neon. Pooled connection string for the branch. Written by `neon env pull` / `neon link`. |
| `NEON_AUTH_BASE_URL` | Neon. Auth URL of the same branch as `DATABASE_URL`. Written by `neon env pull` / `neon link`. |
| `NEON_AUTH_COOKIE_SECRET` | You. `openssl rand -base64 32`. At least 32 characters. Neon does not provide it. |
| `ADMIN_EMAILS` | You. Comma-separated admin emails, for example `first@example.com,second@example.com`. Case-insensitive. |

`neon env pull` also writes `DATABASE_URL_UNPOOLED` (direct connection, used for migrations), `NEON_BRANCH` and `NEON_AUTH_JWKS_URL`. The app ignores them at runtime. `neon env pull` only rewrites Neon's own variables, so the two you add to `.env.local` survive a re-pull.

### Neon branches and environments

The Neon project is `wild-cloud-37283675` (`alex-and-joanna-wedding`, AWS eu-west-2). It has exactly two branches:

| Neon branch | Used by | Data |
| --- | --- | --- |
| `development` | local `.env.local`, Vercel Development, Vercel Preview | test data only |
| `production` (default) | Vercel Production only | real guest data |

There is no separate preview branch, and Vercel's per-preview-deployment branching stays off. Neon Auth data (users, sessions, settings) lives in each branch's `neon_auth` schema, so every environment pairs one branch's `DATABASE_URL` with the same branch's `NEON_AUTH_BASE_URL`.

`ADMIN_EMAILS` is the same list in every environment unless you want to test with other addresses on `development`.

No variable is exposed to the browser. None use the `NEXT_PUBLIC_` prefix, and database and auth modules import `server-only`, so importing them from a client component fails the build.

## Neon setup

### Services (`neon.ts`, applied with the Neon CLI)

`neon.ts` declares the Neon services every branch should have. Today that is only Neon Auth (`auth: true`). It uses `@neon/config`, which `neon config init` installs. `@neon/env` comes with it but the app does not use it. The app validates its own env in `lib/env/schema.ts`.

To apply it to a branch, link that branch, check the plan, then deploy:

```bash
neon link --project-id wild-cloud-37283675 --branch <development|production> -y --no-env-pull
neon config plan     # dry run. Stop if it deletes or replaces anything.
neon deploy --no-env-pull
neon link --project-id wild-cloud-37283675 --branch development -y --no-env-pull   # always relink to development afterwards
```

Pass `--no-env-pull` whenever production is linked. Otherwise the CLI writes production credentials into `.env.local`.

`neon.ts` does not cover sign-in methods, trusted domains or email settings. Set those per branch as below.

### Auth settings per branch

`neon.ts` turns Neon Auth on, but sign-in methods, trusted domains and email are separate settings on each branch, in the Neon Console under the branch's **Auth** pages. (The CLI and API cover some of them: `neon neon-auth ...` and `neon api /projects/{id}/branches/{id}/auth/...`.)

| Setting | `development` | `production` |
| --- | --- | --- |
| Magic Link plugin | on | on? Not shown by the config API. **Check in the Console.** |
| Magic link expiry | 5 min (Neon default) | 5 min default. 10 to 15 is more forgiving for email delays. |
| Magic link "Allow New User Registration" | on, so an admin's first sign-in creates their account | on |
| Email and password | off, sign-up off (checked) | off, sign-up off (checked) |
| Google or other social sign-in | none configured (checked) | none configured (checked) |
| Trusted domains | Only the `test/vercel-preview` branch URL. Other preview branches can't sign in until you add their URL or a wildcard such as `https://alex-and-joanna-wedding-*-alexr6667s-projects.vercel.app`. | `https://alex-and-joanna-wedding.vercel.app` only (checked). No preview origins. |
| Allow localhost | on | off (checked) |
| Email provider | Neon shared sender (`auth@mail.myneon.app`) | Custom SMTP, Gmail (`smtp.gmail.com:587`, sender `alexandjoannawedding@gmail.com`) (checked). **Delivery not tested yet.** |
| Application name | set (appears in emails) | set |

"Checked" means read on 30 September 2026 with `get_neon_auth_config` from the Neon MCP server, which returned each branch's own Auth endpoint, origins and email provider. Still to do by hand on production: confirm the Magic Link plugin is on, request a magic link for an admin address and check it arrives, and confirm a password sign-in against production's Auth URL returns `EMAIL_PASSWORD_DISABLED`.

Why these matter:

- The app only asks Neon to send magic links to allowlisted addresses. Password sign-up and Google sign-in can still be called directly against the branch's Auth URL, bypassing this app. Leaving password sign-up on would let someone create a password account for an admin's address before that admin first signs in. The app blocks both routes through its own proxy, but turn them off in Neon as well.
- Vercel Preview uses the `development` branch, so preview origins belong on `development`'s trusted domains, never on `production`'s.

`development` was branched from `production`, so its copy of `neon_auth.project_config` carries production's config id. Afterwards, `neon neon-auth plugins list --branch production` returned `development`'s settings, while production's own database and Auth endpoint still had the old ones. Until that is resolved, check production's Auth settings in the Console, and confirm them with a request to production's Auth URL (for example, a password sign-in should return `EMAIL_PASSWORD_DISABLED`). Do not rely on the CLI's read-back for production.

### Magic-link email delivery

Neon Auth sends magic-link emails itself. No email code or email package is in this repo.

- **Development:** Neon's shared sender (`auth@mail.myneon.app`) works with no setup, but it is rate-limited.
- **Production:** Neon's production checklist says to use your own email provider, and the Magic Link docs say the shared sender should only be used during development. Configure one per branch in the Console's Auth settings, or with `neon neon-auth config email-provider` (host, port, username, password, sender email, sender name). Any SMTP service works (for example Resend, Postmark or SES). Production is set up with Gmail SMTP (checked 30 September 2026), but no magic link has been sent through it yet. Gmail needs an app password and limits daily sending, which is plenty for two admins.

## Database migrations

Drizzle manages only the `public` schema (`drizzle.config.ts` sets `schemaFilter: ["public"]`). Neon Auth owns the `neon_auth` schema. Do not add auth tables to `lib/db/schema.ts`.

```bash
npm run db:generate   # after changing lib/db/schema.ts; writes SQL to drizzle/
npm run db:migrate    # applies pending migrations to DATABASE_URL
```

Use the direct (non-pooled) connection string for migrations:

```bash
# development (what .env.local points at)
DATABASE_URL="$(grep '^DATABASE_URL_UNPOOLED=' .env.local | cut -d= -f2- | tr -d '"')" npm run db:migrate

# production: only when a release needs it. Fetch the string into the command, never into a file.
DATABASE_URL="$(neon connection-string production --project-id wild-cloud-37283675)" npm run db:migrate
```

Vercel builds do not run migrations. Run them against a branch before deploying code that needs them. `drizzle-kit migrate` records applied migrations in `drizzle.__drizzle_migrations`, so a rerun is a no-op.

| Migration | Contents |
| --- | --- |
| `0000_init` | `app_meta` |
| `0001_guests_rsvps_settings` | All Shot 2 tables and enums. Additive only |
| `0002_seed_defaults` | The settings row (private, no deadline, menu off) and the four menu categories. `ON CONFLICT DO NOTHING`, no guests, no menu options |
| `0003_guest_import_previews` | `guest_import_previews`, the server's record of a checked CSV file. Additive only |

### Schema

- `site_settings`: one row. Access mode, RSVP deadline (a date), menu on/off, which optional RSVP questions to ask, WhatsApp template, and `content` (JSON page copy, validated by `lib/settings/schema.ts` and merged over the defaults in `lib/settings/defaults.ts`).
- `faq_entries`, `menu_categories` (fixed keys: arrival drink, starter, main, dessert), `menu_options`.
- `family_groups` (name unique, case-insensitive), `guests` (`invitation_token_hash`, never the token), `guest_sessions` (hash of the cookie value).
- `rsvps`: one per guest. `rsvp_attendees`: the guest and, if brought, their plus-one, each with dietary needs and one option per menu category.
- `guest_imports`: SHA-256 of each imported CSV, so a file can't be imported twice.
- `guest_import_previews`: one row per checked CSV file waiting to be confirmed (admin email, file SHA-256, lines flagged as possible duplicates, expiry).

The app uses node-postgres (`pg`) over Neon's pooled connection, with `attachDatabasePool` from `@vercel/functions`, so multi-step writes run in transactions.

## How admin auth works

1. `/admin/login` calls `authClient.signIn.magicLink()`, which posts to this app's `/api/auth/sign-in/magic-link`.
2. The route handler in `app/api/auth/[...path]/route.ts` checks the email against `ADMIN_EMAILS`.
   - Approved: it forwards the request to Neon Auth with fixed redirect targets (`/admin`, and `/admin/login?error=link` on failure). A caller cannot change where the link sends people.
   - Not approved: it returns the same success response without contacting Neon, so no email is sent and the form does not reveal who the admins are.
   - It also refuses every other state-changing auth endpoint except sign-out (for example password sign-up) with a 404.
3. Neon Auth emails the link. Following it creates the session. Neon Auth sets the session cookies (HTTP-only, Secure), and `@neondatabase/auth` handles session caching and refresh.
4. `proxy.ts` redirects signed-out visitors from `/admin/*` to `/admin/login` and finishes Neon Auth's session exchange.
5. `/admin` checks again on the server (`lib/auth/admin.ts`). The session must exist, the email must be verified, and it must be in `ADMIN_EMAILS`. Signed-in users who fail the check see "Access denied". This server check is the security boundary, not `proxy.ts`.

Sign-out is a server action that calls `auth.signOut()`.

## Site access

`site_access_mode` is `private` (the default) or `public`, set in `/admin/settings`. Changes apply on the next request.

- **Private.** `/` shows an invitation-only screen with no date, venues or guest information, unless the browser holds a valid guest session.
- **Public.** `/` shows the general wedding information to anyone. The RSVP section asks visitors to use their invitation link. Guest data is never public in either mode.

## Invitations

Every guest has their own link, `/invite/<token>`. Family members never share one.

- Tokens are 32 bytes from `crypto.randomBytes`, base64url. Only the SHA-256 hash is stored.
- A new guest has no link. "Create invitation link" on the guest page shows the link and a ready WhatsApp message once, with copy buttons. The raw token is never stored, logged or put in browser storage, so it can't be shown again. If it's lost, regenerate it.
- Regenerating replaces the hash. The old link stops working immediately and any browser that used it loses its session.
- Opening a link hashes the token, looks it up, creates a `guest_sessions` row and sets a cookie, then redirects to `/` so the token leaves the address bar. All failures look the same. Failed attempts are rate-limited per client (in memory, per server instance; no IPs are stored).
- The cookie is `__Host-wedding_guest`: a new random value, HttpOnly, Secure, SameSite=Lax, one year. It holds no guest id, so it can't be edited to become another guest. Archived guests' links and sessions stop working.
- The app never logs the token, but Vercel's request logs record request paths, including `/invite/<token>`. Keep log access to the admins.

## Admin previews

Both previews are ordinary `/admin` pages. They go through the same server-side admin check, set no cookies and never create a guest session. Neither weakens the private-site gate on `/`.

- **Preview wedding site** (dashboard, opens in a new tab): `/admin/preview` renders the guest-facing page with general content only. The RSVP section shows a placeholder, and no guest data is loaded.
- **Preview as guest** (guest page): `/admin/guests/[id]/preview` renders the page as that guest sees it: their name, current RSVP, plus-one controls, menu questions and deadline state. The form is read-only, and the invitation token and its hash are never read. A banner marks preview mode, and "Exit preview" returns to the guest's admin page.

## Admin features

- **Dashboard.** Invited, attending, declined, awaiting, plus-ones coming, total coming, RSVP deadline. Archived guests are excluded.
- **Guests.** Search by name or group; filter by RSVP status, family group, archived, plus-one allowed. Add, edit, archive (soft delete) and restore. Turning off a guest's plus-one deletes any plus-one details they gave.
- **RSVP editing.** Admins can edit any RSVP, including after the deadline. Menu choices are optional for admins.
- **Family groups.** Create, rename, delete when empty, remove members. Assign a guest to a group from the guest page. Groups don't affect access or RSVPs.
- **Content.** Welcome text, ceremony and reception, timings, dress code, getting there, where to stay, FAQ (add, edit, reorder, delete).
- **Menu.** One global switch, per-category switch and name, and options with name, description, available/unavailable and order. Options are switched off, not deleted, so earlier choices keep their names. Guests pick one available option in each enabled category that has options. If a guest's earlier choice was switched off (the option, its category or the whole menu), the RSVP form shows it as read-only text and never offers it as an option again. A choice in a switched-off category is kept as it was; a switched-off option in a category still asked has to be replaced.
- **Settings.** Access mode, RSVP deadline (guests can edit until the end of that day, UK time; empty means open), menu switch, which optional questions to ask (dietary, song, notes), and the WhatsApp template (`{first_name}`, `{link}`).

Defaults in `lib/settings/defaults.ts` hold the confirmed facts and placeholders. The live copy is edited in `/admin` and stored in the database, so changes need no redeploy.

## CSV import and export

Import on `/admin/import`. The header row must be exactly:

```
first_name,last_name,family_group,plus_one_allowed
```

- The first row is always the header and is never imported. Parsing uses Papa Parse (quoted fields, commas and line breaks in quotes, BOM).
- `first_name` and `last_name` are required, `family_group` is optional (blank means no group), and `plus_one_allowed` must be `true` or `false`.
- "Check file" writes no guests, groups or import records. It shows every row, lists invalid rows with reasons, and warns about names repeated in the file or already on the list. Duplicates are never merged, and the admin must tick a box to import them as separate guests.
- If the file can be imported, "Check file" also stores a preview record in `guest_import_previews`: which admin checked it, the file's SHA-256 and which lines were flagged. The server only imports a file that has a preview record for the same admin and exactly the same contents, less than 30 minutes old. A successful import deletes the record. The record lives in Postgres because each request may run on a different Vercel instance.
- Imports run one at a time. Each takes a Postgres advisory lock (`pg_advisory_xact_lock`) before it checks for duplicates, and releases it at commit or rollback. Two files with overlapping names can't both pass the duplicate check. Ticking the duplicates box covers only the lines the preview flagged. If another import adds a matching name in the meantime, the server asks the admin to check the file again.
- Any invalid row blocks the whole import. The same file (by SHA-256) can't be imported twice. A failed import rolls back completely.
- Existing family groups are reused (case-insensitive); new names create a group.
- Imported guests have no invitation link until an admin creates one.

`/admin/export` (the "Export CSV" link) downloads every guest with RSVP status, plus-one, menu choices, dietary needs, song, notes and timestamps. It never contains tokens or hashes. Choices kept from before a guest declined are left out. Cells starting with `=`, `+`, `-` or `@` get a leading `'` so spreadsheets don't run them.

## Tests

```bash
npm run lint
npm run typecheck
npm test              # Vitest unit tests (lib/**/*.test.ts, e2e/support/**/*.test.ts)
npm run test:e2e      # Playwright; builds the app first when run locally
```

First-time Playwright setup: `npx playwright install chromium`. Playwright also needs Docker running locally (see below).

Unit tests cover tokens and hashing, guest-session resolution, the admin gates, site access, RSVP deadline and validation (plus-one permission, menu rules), CSV parsing, duplicate detection and family-group mapping, CSV export, settings validation, and log redaction.

### E2E database

Playwright runs against a throwaway Postgres, never Neon. `e2e/support/global-setup.ts` starts a `postgres:17-alpine` container called `wedding-e2e-postgres` on port 54329 if nothing is listening there, drops and recreates the schema, and applies the real migrations. Every test starts from an empty database with the seeded defaults. Fixtures in `e2e/support/db.ts` write test guests straight to that database. Stop the container with `docker stop wedding-e2e-postgres`.

To use a different database, set `E2E_DATABASE_URL`. `e2e/support/database-guard.ts` refuses it before connecting unless the host is `localhost`, `127.0.0.1` or `::1` and the database name ends in `_e2e` or `_test`, because the suite wipes it.

A few E2E tests hold a lock in their own transaction while the app handles requests, to check that concurrent changes can't be undone by a request already in flight (regenerating a link, withdrawing a plus-one) and that concurrent CSV imports can't slip duplicates past each other. `openTransaction()` in `e2e/support/db.ts` waits until exactly the expected number of requests are blocked behind that transaction (directly or behind each other) and throws otherwise. Tests close it in `finally`, so a failed test never leaves locks held.

### Auth testing strategy

Playwright never talks to Neon Auth and never sends email. `playwright.config.ts` starts two servers:

- `e2e/support/mock-neon-auth.mjs`, a small stand-in for the Neon Auth HTTP API. It records magic-link requests and recognises a few fixed session tokens (approved admin, unapproved user, unverified admin).
- The production build of the app, with `NEON_AUTH_BASE_URL` pointing at the mock and `DATABASE_URL` at the test database (`e2e/support/test-env.ts`). These override `.env.local`.

The app code is identical to production. Only its configuration differs, so the tests do not weaken production auth. Each spec runs on a desktop and a mobile (Pixel 7) viewport.

What the mock cannot prove is real email delivery and Neon's link verification. Check that by hand on the `development` branch after setup:

1. Request a link for an allowlisted address. It arrives, and following it lands on `/admin` signed in.
2. Request a link for a non-allowlisted address. Nothing is sent.
3. Sign out, then confirm `/admin` redirects to the login page.

### CI

`.github/workflows/ci.yml` runs on every pull request and on pushes to `main`: install, lint, typecheck, unit tests, production build, Playwright. A `postgres` service container is the E2E database. It uses dummy environment values and needs no secrets.

## Deploying on Vercel (manual)

The project is connected, and production is https://alex-and-joanna-wedding.vercel.app. The setup, for reference:

1. Push this repo to GitHub.
2. In Vercel, **Add New > Project**, import the repo. The framework preset is Next.js. No build settings need changing.
3. In **Settings > Environment Variables**, set each Vercel environment as below. Mark `DATABASE_URL` and `NEON_AUTH_COOKIE_SECRET` as sensitive.

   | Vercel environment | Neon branch | `DATABASE_URL` | `NEON_AUTH_BASE_URL` | `NEON_AUTH_COOKIE_SECRET` | `ADMIN_EMAILS` |
   | --- | --- | --- | --- | --- | --- |
   | Development | `development` | `development` pooled string | `development` Auth URL | random value A | admin list |
   | Preview | `development` | `development` pooled string | `development` Auth URL | random value A (same as Development) or its own | admin list |
   | Production | `production` | `production` pooled string | `production` Auth URL | its own random value, never reused | admin list |

   Get each branch's Neon values with `neon env pull --branch <name> --file <scratch file>`, copy them into Vercel, then delete the scratch file. `DATABASE_URL_UNPOOLED`, `NEON_BRANCH` and `NEON_AUTH_JWKS_URL` are not needed in Vercel.
4. If you use the Neon integration from the Vercel Marketplace instead of pasting values, point Development and Preview at `development` and Production at `production`, and make sure `NEON_AUTH_BASE_URL` comes from the same branch as `DATABASE_URL`. Do not turn on per-deployment preview branches. Each would get its own database and Auth URL.
5. Before the first preview, add the Vercel preview wildcard to `development`'s trusted domains. Before the first production deploy, add the production domain to `production`'s trusted domains (see "Auth settings per branch").
6. Run `npm run db:migrate` against `production` before deploying code that needs new migrations (Shot 2 needs `0001`, `0002` and `0003`).
7. Invitation links use the host the admin is on. Links created on a preview deployment point at that preview and at `development` data, so create real guests' links only on the production domain.

## Security defaults

- Database and auth code run only on the server (`server-only` imports). No secrets reach the browser.
- Environment errors never include values. `instrumentation.ts` wraps `console.error`/`console.warn` so database errors log only their Postgres code: Drizzle puts query parameters (names, notes, hashes) in its error messages, and Postgres can echo row values.
- Next.js hides error details in production, and `app/error.tsx` shows a generic message.
- Every admin page, Server Action and route handler checks for a verified, allowlisted admin on the server. Server Actions also reject cross-origin POSTs (Origin must match Host), which with SameSite cookies covers CSRF.
- Guest actions identify the guest only from the session cookie. Forms never carry a guest id.
- Invitation and session tokens are 256-bit random values; only SHA-256 hashes are stored. Lookups are by hash, with a constant-time comparison after.
- Baseline headers: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`. `/invite/*` uses `no-referrer`.
- No page is indexed (`noindex` site-wide).
- The app stores no addresses, phone numbers, IPs or analytics. Guest names never appear in URLs.

## Design

Colours, fonts and spacing are tokens at the top of `app/globals.css` (`--color-paper`, `--color-ink`, `--color-muted`, `--color-accent`, `--color-line`, ...). Components use them through Tailwind classes, so restyling means editing that block. Fonts are Cormorant Garamond (headings) and Inter (body), self-hosted at build time by `next/font`. The botanical line drawings are placeholder SVG components in `components/decor/sprig.tsx`. The couple photo is a placeholder in `components/site/wedding-site.tsx`.

## Project layout

```
app/                     routes (App Router)
  page.tsx               the wedding page (access gate + sections)
  invite/[token]/        invitation exchange (route handler)
  rsvp-actions.ts        guest RSVP Server Action
  admin/                 admin pages, previews, Server Actions, CSV export
  api/auth/[...path]/    Neon Auth proxy with allowlist guard
components/
  site/                  guest-facing page, RSVP form and summary
  admin/                 admin shell, forms, invitation panel, import form
  decor/                 placeholder botanical SVGs
lib/
  auth/                  Neon Auth server/client, allowlist, admin gates
  db/                    Drizzle client and schema
  guest/, invitations/   guest sessions, invitation tokens and messages
  rsvp/, menu/           RSVP validation, deadline, storage; menu rules
  guests/, families/     guest and family-group queries and validation
  import/, export/       CSV import and export
  settings/              defaults, validation and storage for site settings
  site/                  access decision and page data loading
  security/, logging/    tokens, rate limiting, log redaction
drizzle/                 SQL migrations
e2e/                     Playwright specs, Neon Auth mock, test database helpers
instrumentation.ts       validates env and installs log redaction on start
neon.ts                  Neon services for each branch (Neon Auth)
proxy.ts                 early redirect for /admin (Next.js 16 name for middleware)
```
