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
npm i -g neon@latest && neon auth                                    # Neon CLI, once per machine
neon link --project-id wild-cloud-37283675 --branch development -y   # writes .neon and pulls Neon vars into .env.local
# add NEON_AUTH_COOKIE_SECRET and ADMIN_EMAILS to .env.local, see below
DATABASE_URL="$(grep '^DATABASE_URL_UNPOOLED=' .env.local | cut -d= -f2-)" npm run db:migrate
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
| Magic Link plugin | on (done) | **turn on** |
| Magic link expiry | 5 min (Neon default) | 5 min default. 10 to 15 is more forgiving for email delays. |
| Magic link "Allow New User Registration" | on, so an admin's first sign-in creates their account | on |
| Email and password | off (done) | **turn off** |
| Google sign-in (Neon's shared OAuth app, on by default) | on. Turn off. | on. **Turn off.** |
| Trusted domains | localhost is allowed. Add the Vercel preview wildcard (for example `https://*-your-team.vercel.app`) before using Vercel Preview. | **Add the production origin only** (for example `https://example.com`). No preview wildcard. |
| Allow localhost | on | **turn off** |
| Email provider | Neon shared sender | **Custom SMTP** before real use (see below) |
| Application name | set (appears in emails) | set |

Why these matter:

- The app only asks Neon to send magic links to allowlisted addresses. Password sign-up and Google sign-in can still be called directly against the branch's Auth URL, bypassing this app. Leaving password sign-up on would let someone create a password account for an admin's address before that admin first signs in. The app blocks both routes through its own proxy, but turn them off in Neon as well.
- Vercel Preview uses the `development` branch, so preview origins belong on `development`'s trusted domains, never on `production`'s.

`development` was branched from `production`, so its copy of `neon_auth.project_config` carries production's config id. Afterwards, `neon neon-auth plugins list --branch production` returned `development`'s settings, while production's own database and Auth endpoint still had the old ones. Until that is resolved, check production's Auth settings in the Console, and confirm them with a request to production's Auth URL (for example, a password sign-in should return `EMAIL_PASSWORD_DISABLED`). Do not rely on the CLI's read-back for production.

### Magic-link email delivery

Neon Auth sends magic-link emails itself. No email code or email package is in this repo.

- **Development:** Neon's shared sender (`auth@mail.myneon.app`) works with no setup, but it is rate-limited.
- **Production:** Neon's production checklist says to use your own email provider, and the Magic Link docs say the shared sender should only be used during development. Configure one per branch in the Console's Auth settings, or with `neon neon-auth config email-provider` (host, port, username, password, sender email, sender name). Any SMTP service works (for example Resend, Postmark or SES). This is a manual step with an external account, and it is not done yet.

## Database migrations

Drizzle manages only the `public` schema (`drizzle.config.ts` sets `schemaFilter: ["public"]`). Neon Auth owns the `neon_auth` schema. Do not add auth tables to `lib/db/schema.ts`.

```bash
npm run db:generate   # after changing lib/db/schema.ts; writes SQL to drizzle/
npm run db:migrate    # applies pending migrations to DATABASE_URL
```

`db:migrate` reads `.env.local`. Neon recommends the direct (non-pooled) connection string for migrations, which `neon env pull` writes as `DATABASE_URL_UNPOOLED`:

```bash
# development (what .env.local points at)
DATABASE_URL="$(grep '^DATABASE_URL_UNPOOLED=' .env.local | cut -d= -f2-)" npm run db:migrate

# production: fetch the direct string into the command only, never into a file
DATABASE_URL="$(neon connection-string production --project-id wild-cloud-37283675)" npm run db:migrate
```

Run migrations against both branches (`development`, `production`) before the code that needs them is deployed. Vercel builds do not run migrations. `drizzle-kit migrate` records applied migrations in its own `drizzle.__drizzle_migrations` table, so a rerun is a no-op.

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

What the mock cannot prove is real email delivery and Neon's link verification. Check that by hand on the `development` branch after setup:

1. Request a link for an allowlisted address. It arrives, and following it lands on `/admin` signed in.
2. Request a link for a non-allowlisted address. Nothing is sent.
3. Sign out, then confirm `/admin` redirects to the login page.

### CI

`.github/workflows/ci.yml` runs on every pull request and on pushes to `main`: install, lint, typecheck, unit tests, production build, Playwright. It caches npm, `.next/cache` and the Playwright browser. It uses dummy environment values and needs no secrets. No tests need a live database or live Neon Auth yet. When they do, put them in a separate job that reads secrets pointing at the `development` branch (never `production`), and keep this job offline.

## Deploying on Vercel (manual)

Not connected yet. When it is:

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
6. Run `npm run db:migrate` against `production` before the first production deploy.

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
neon.ts                  Neon services for each branch (Neon Auth)
proxy.ts                 early redirect for /admin (Next.js 16 name for middleware)
```
