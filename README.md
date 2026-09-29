# Alex & Joanna wedding site

Private wedding website for Alex and Joanna, 28 August 2027.

This is the Shot 1 skeleton: placeholder pages, admin sign-in with Neon Auth magic links, Drizzle wired to Neon Postgres, and tests plus CI. The real site, guest data and RSVPs come in Shot 2.

Stack: Next.js 16 (App Router), TypeScript, Tailwind CSS 4, Neon Postgres, Neon Auth (`@neondatabase/auth`), Drizzle ORM, Vitest, Playwright, GitHub Actions.

## Routes

| Route | What it does |
| --- | --- |
| `/` | Public placeholder |
| `/rsvp/[token]` | RSVP placeholder. Accepts `[A-Za-z0-9_-]{1,128}`, returns 404 for anything else, never echoes the token, sends `Referrer-Policy: no-referrer` |
| `/admin/login` | Email-only form that requests a magic link |
| `/admin` | Admin placeholder. Requires a session whose email is verified and in `ADMIN_EMAILS` |
| `/api/auth/*` | Proxy to Neon Auth (see "How admin auth works") |

## Requirements

- Node.js 24 (see `.nvmrc`; `nvm use` picks it up)
- npm (lockfile is `package-lock.json`)

## Local setup

```bash
npm install
cp .env.example .env.local   # then fill in real values, see below
npm run db:migrate
npm run dev                  # http://localhost:3000
```

The app refuses to build or start if any required variable is missing or malformed. The error names the variable but never prints its value.

## Environment variables

All four are required everywhere.

| Variable | Where to get it |
| --- | --- |
| `DATABASE_URL` | Neon Console > your branch > Connect. Pooled connection string. |
| `NEON_AUTH_BASE_URL` | Neon Console > your branch > Auth > Configuration. Must be the Auth URL of the same branch as `DATABASE_URL`. |
| `NEON_AUTH_COOKIE_SECRET` | `openssl rand -base64 32`. At least 32 characters. |
| `ADMIN_EMAILS` | Comma-separated admin emails, for example `first@example.com,second@example.com`. Case-insensitive. |

Neon Auth data lives in each database branch, so each environment pairs one branch's `DATABASE_URL` with the same branch's `NEON_AUTH_BASE_URL`:

| Environment | Neon branch | Cookie secret |
| --- | --- | --- |
| Local `.env.local` | a development branch (for example `dev`) | its own random value |
| Vercel Development (used by `vercel env pull` / `vercel dev`) | the same development branch | its own random value |
| Vercel Preview | a separate `preview` branch | its own random value |
| Vercel Production | the default branch (`main`) | its own random value |

`ADMIN_EMAILS` is the same list in every environment unless you want to test with other addresses on a dev branch.

No variable is exposed to the browser. None use the `NEXT_PUBLIC_` prefix, and database and auth modules import `server-only`, so importing them from a client component fails the build.

## Neon setup (manual, in the Neon Console)

1. Create a Neon project. Pick a region close to your Vercel region.
2. Create the branches you need (`dev`, `preview`). The default branch is production.
3. On each branch, open **Auth** and click **Enable Auth**. Copy the Auth URL from the **Configuration** tab into that environment's `NEON_AUTH_BASE_URL`.
4. On each branch, go to **Auth > Plugins** and turn on **Magic Link**.
   - **Link Expiration**: the default is 5 minutes. 10 to 15 is more forgiving for email delays.
   - **Allow New User Registration**: leave on so an admin's first sign-in creates their account. The app only asks Neon to send links to allowlisted addresses (see below).
5. Turn off email and password authentication. This app never uses passwords, and leaving it on lets someone register a password account for an admin's address before the admin signs in for the first time. Turn it off in the branch's Auth settings in the Console, or through the `email_and_password` endpoint of the Neon API.
6. Under **Auth > Configuration > Domains**, add the production origin (for example `https://example.com`) on the production branch. On the preview branch, add a wildcard for Vercel previews (for example `https://*-your-team.vercel.app`). Localhost is pre-approved.
7. Set the **Application Name** (Auth > Configuration > Project Info). It appears in sign-in emails.
8. On the production branch, turn off **Allow Localhost** (Settings > Auth).

### Magic-link email delivery

Neon Auth sends magic-link emails itself. No email code or email package is in this repo.

- **Development:** Neon's shared sender (`auth@mail.myneon.app`) works with no setup, but it is rate-limited.
- **Production:** Neon's production checklist says to use your own email provider, and the Magic Link docs say the shared sender should only be used during development. Configure one under **Settings > Auth > Custom SMTP provider** (host, port, username, password, sender email, sender name). Any SMTP service works (for example Resend, Postmark or SES). This is a manual step with an external account, and it is not done yet.

## Database migrations

Drizzle manages only the `public` schema (`drizzle.config.ts` sets `schemaFilter: ["public"]`). Neon Auth owns the `neon_auth` schema. Do not add auth tables to `lib/db/schema.ts`.

```bash
npm run db:generate   # after changing lib/db/schema.ts; writes SQL to drizzle/
npm run db:migrate    # applies pending migrations to DATABASE_URL
```

`db:migrate` reads `.env.local`. Neon recommends the direct (non-pooled) connection string for migrations. To use it, prefix the command:

```bash
DATABASE_URL="postgresql://...direct-host.../neondb?sslmode=require" npm run db:migrate
```

Run migrations against each branch (dev, preview, production) before the code that needs them is deployed. Vercel builds do not run migrations.

The only table so far is `app_meta` (key/value). The admin page queries it to show whether the database is reachable and migrated.

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

## Tests

```bash
npm run lint
npm run typecheck
npm test              # Vitest unit tests (lib/**/*.test.ts)
npm run test:e2e      # Playwright; builds the app first when run locally
```

First-time Playwright setup: `npx playwright install chromium`.

### Auth testing strategy

Playwright never talks to Neon and never sends email. `playwright.config.ts` starts two servers:

- `e2e/support/mock-neon-auth.mjs`, a small stand-in for the Neon Auth HTTP API. It records magic-link requests and recognises a few fixed session tokens (approved admin, unapproved user, unverified admin).
- The production build of the app, with `NEON_AUTH_BASE_URL` pointing at the mock and dummy values for the other variables (`e2e/support/test-env.ts`). These override `.env.local`.

The app code is identical to production. Only its configuration differs, so the tests do not weaken production auth. They cover: anonymous redirects, the login form, allowlisted and non-allowlisted magic-link requests, redirect-target overriding, blocked password endpoints, denied access for unapproved or unverified sessions, and admin access and sign-out. Neon Auth has no official offline test mode, so the mock takes its place.

What the mock cannot prove is real email delivery and Neon's link verification. Check that by hand on the `dev` branch after setup:

1. Request a link for an allowlisted address. It arrives, and following it lands on `/admin` signed in.
2. Request a link for a non-allowlisted address. Nothing is sent.
3. Sign out, then confirm `/admin` redirects to the login page.

### CI

`.github/workflows/ci.yml` runs on every pull request and on pushes to `main`: install, lint, typecheck, unit tests, production build, Playwright. It caches npm, `.next/cache` and the Playwright browser. It uses dummy environment values and needs no secrets. No tests need a live database or live Neon Auth yet. When they do, put them in a separate job that reads secrets pointing at a dedicated Neon test branch, and keep this job offline.

## Deploying on Vercel (manual)

1. Push this repo to GitHub.
2. In Vercel, **Add New > Project**, import the repo. The framework preset is Next.js. No build settings need changing.
3. In **Settings > Environment Variables**, add all four variables separately for Production, Preview and Development, using the branch mapping above. Mark `DATABASE_URL` and `NEON_AUTH_COOKIE_SECRET` as sensitive.
4. If you use the Neon integration from the Vercel Marketplace instead of pasting `DATABASE_URL` yourself, check which branch each environment points to, and make sure `NEON_AUTH_BASE_URL` belongs to that same branch. Do not turn on per-deployment preview branches yet. Each would get its own Auth URL, which this setup does not wire up.
5. Add your production domain to Neon Auth's trusted domains (step 6 of Neon setup).
6. Run `npm run db:migrate` against the production branch before the first production deploy.

## Security defaults

- Database and auth code run only on the server (`server-only` imports). No secrets reach the browser.
- Environment errors never include values. The database health check logs only the error class.
- Next.js hides error details in production, and `app/error.tsx` shows a generic message.
- Admin access is checked on the server for every request, by session plus verified allowlisted email.
- Sessions, cookies and tokens come from Neon Auth. The repo has no custom password or session cryptography.
- Baseline headers: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`. RSVP pages use `no-referrer`.
- Admin and RSVP pages send `noindex`.
- URLs contain no personal data. The only planned exception is the future random RSVP token.

## Project layout

```
app/                     routes (App Router)
  admin/                 admin login, admin page, sign-out action
  api/auth/[...path]/    Neon Auth proxy with allowlist guard
  rsvp/[token]/          RSVP placeholder
components/              shared UI
lib/auth/                Neon Auth server/client, allowlist, admin gate
lib/db/                  Drizzle client and schema
lib/env/                 environment validation
drizzle/                 generated SQL migrations
e2e/                     Playwright tests and the Neon Auth mock
instrumentation.ts       validates env when the server starts
proxy.ts                 early redirect for /admin (Next.js 16 name for middleware)
```
