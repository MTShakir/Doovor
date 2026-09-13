# Runbook

How to run, deploy and look after the platform. Brand values (name, domain, sender addresses) live in `packages/config/src/brand.ts`; this file quotes today's values, which change with that file (D-026).

## 1. Environments

| Environment | App | Database | `APP_ENV` | Notes |
|---|---|---|---|---|
| Local | `pnpm dev` on http://localhost:3000 | Local Supabase in Docker | `local` | Emails land in Mailpit; test phone numbers use code `123456` (D-033) |
| CI | Production build in GitHub Actions | Local Supabase in the runner | `test` | Every push: lint, types, unit, pgTAP, Playwright (M0-31) |
| Preview | Vercel deployment per branch and pull request | Staging Supabase | `preview` | Private (Vercel Authentication). Password sign-in works; email and Google sign-in finish on the staging domain (D-046) |
| Staging | Vercel production deployment of `main`, on the brand domain until launch | Staging Supabase (free plan, D-032) | `preview` | Not indexed (D-047). Demo data only |
| Production | From M6 | Supabase Pro in London with point-in-time recovery | `production` | Fake providers refused at boot; indexing allowed for public pages |

## 2. Local setup (first time)

1. Install Node 24 (see `.nvmrc`), pnpm 12 (`npm install -g pnpm@12.3.4`) and Docker Desktop (WSL 2 on Windows).
2. `pnpm install`
3. `pnpm db:start` to start the local Supabase stack. The first run pulls the images.
4. `pnpm db:env` to write `.env.local` from `.env.example` and the stack's keys.
5. `pnpm db:reset` to apply the migrations and seed the demo data.
6. `pnpm dev`, then open http://localhost:3000.

Useful local addresses: Mailpit http://127.0.0.1:54324 (every email), Studio http://127.0.0.1:54323 (database browser).

Seeded accounts all use the password `Password123!` (listed when the seed runs). Staff and the school owner need an authenticator code: their TOTP secrets are in `e2e/.auth/seed-accounts.json`. Add one to an authenticator app as a manual key.

Before every commit: `pnpm check`. Database changes also need `pnpm db:test` and `pnpm db:lint`. User-facing changes need `pnpm test:e2e`.

## 3. Staging setup (M0-32)

Do these once, in order. Items marked **You** need the product owner's accounts. If you prefer, put the access tokens in `.env.local` (never in chat or git) and the engineer runs the command-line steps.

### 3.1 Supabase (project `DrivingHub`)

1. **You:** check the project region is London (`eu-west-2`). If not, create a new free project in London and remove the old one. Data must stay in the UK.
2. Link and apply the migrations:
   ```bash
   pnpm supabase login
   pnpm supabase link --project-ref yvxuarrrvgnfcjfyqfyi
   pnpm supabase db push --dry-run
   pnpm supabase db push
   ```
3. Check the session sign-out guard is active (D-041): in the SQL editor, `select rolconfig from pg_roles where rolname = 'authenticator';` must include `pgrst.db_pre_request=private.check_request`.
4. **You:** turn on leaked password protection: Authentication > Sign In / Providers > Password > "Prevent use of leaked passwords". Supabase checks a new password against HaveIBeenPwned without ever sending it. The CLI has no config key for it, so it cannot live in `ops/staging/supabase/config.toml` with the rest (M1 security advisor).
5. **You:** put the provider secrets in `.env.local` (never in git or chat), plus a Supabase access token for the command line:
   ```
   SUPABASE_ACCESS_TOKEN=          # Supabase dashboard > Account > Access Tokens
   RESEND_API_KEY=                 # section 3.2, also the SMTP password
   TWILIO_ACCOUNT_SID=             # section 3.3
   TWILIO_AUTH_TOKEN=
   TWILIO_MESSAGING_SERVICE_SID=
   SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=    # section 3.4
   SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=
   ```
6. Apply the hosted auth settings, which live in `ops/staging/supabase/config.toml` and cover the site and redirect URLs, rate limits, email templates, the Resend sender, Twilio, two-step verification and Google:
   ```bash
   pnpm supabase config diff --workdir ops/staging --project-ref yvxuarrrvgnfcjfyqfyi
   pnpm supabase config push --workdir ops/staging --project-ref yvxuarrrvgnfcjfyqfyi
   ```
   That file is deliberately separate from `supabase/config.toml`: the local one carries the test phone numbers, which must never reach a hosted project. Read the diff before pushing, because a push answers its own prompts and can overwrite a hosted setting. The push refuses to run while any provider secret in step 4 is unset, since it would otherwise store placeholder text or an empty password.
7. **You:** Project Settings > API Keys: copy the publishable key and a secret key for Vercel (section 3.5).
8. Check the site is reachable at the site URL once Vercel is connected, then sign in once to confirm emails arrive.
9. **You:** optional: under Authentication > Rate Limits, confirm the pushed values look right for your usage.
10. Optional demo data, with its own password so public accounts never use the documented one. Every target must point at the staging project, because the seed writes through both the API and the database:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL='https://yvxuarrrvgnfcjfyqfyi.supabase.co' \
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='<publishable key>' \
   SUPABASE_SECRET_KEY='<secret key>' \
   SUPABASE_DB_URL='<session pooler connection string>' \
   SEED_PASSWORD='<long random phrase>' \
   pnpm db:seed --allow-remote
   ```
   The seed refuses a hosted project without `SEED_PASSWORD`, refuses a mix of local and hosted targets, and always refuses `APP_ENV=production`.

### 3.2 Resend (email)

1. **You:** add the domain `maxterzhub.co.uk` and create the DNS records Resend shows (SPF, DKIM and DMARC) at the domain's DNS provider. Wait for "Verified".
2. **You:** create an API key with sending access to that domain only. It goes into the Supabase SMTP settings.
3. **You:** create a second API key, also sending to that domain only, for the app's own emails (M2-28). Put it in Vercel as `RESEND_API_KEY` and set `EMAIL_PROVIDER=resend` there. Two keys rather than one, so revoking the app's key never stops a password reset.
4. Without the key the app uses the local provider: it writes a line to the log and sends nothing, which is what every local and test run does.

### 3.2a Web push (VAPID)

1. **You:** generate a key pair: `npx web-push generate-vapid-keys`. It needs no account anywhere; the pair only identifies this application to push services.
2. **You:** in Vercel set `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (`mailto:` and an address a push service can reach you at). Staging and production get their own pair.
3. Changing the public key invalidates every subscription: browsers have to turn push on again. Generate once and keep it.
4. Locally, `pnpm db:env` leaves these blank and the settings screen says push is not set up here. A pair for local work is generated the same way.

### 3.3 Twilio (text codes)

1. **You:** create a Messaging Service with the alphanumeric sender `DrivingHub` (UK senders need no registration; people cannot reply).
2. **You:** Messaging > Geo permissions: allow the United Kingdom only. Set a low monthly spend limit. Public code endpoints attract SMS pumping fraud, and this caps the damage.
3. **You:** enter the Account SID, Auth Token and Messaging Service SID in the Supabase phone provider.
4. **You:** for the app's own reminders (M2-30), put the same three values in Vercel as `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_MESSAGING_SERVICE_SID`, and set `SMS_PROVIDER=twilio`. Without them the app writes a line to the log and texts nobody, which is what every local and test run does. Reminders are the only thing that texts, and only on a plan that includes it: 200 a month on Pro, counted in `sms_usage`.

### 3.4 Google sign-in

1. **You:** in Google Cloud, for OAuth client `647142621690-...`:
   - Authorised redirect URI: `https://yvxuarrrvgnfcjfyqfyi.supabase.co/auth/v1/callback`.
   - Authorised JavaScript origin: `https://maxterzhub.co.uk`.
2. **You:** copy the client secret into the Supabase Google provider.
3. Set `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true` in Vercel. The button stays hidden until then.
4. Locally (optional): add `http://127.0.0.1:54321/auth/v1/callback` as a redirect URI, put the client ID and secret in `.env.local` (`SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`, `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`), set `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true`, then run `pnpm db:stop` and `pnpm db:start`.

### 3.5 Vercel (team `driving-hub`)

1. **You:** New Project, import `MTShakir/DrivingHUB` (this installs the Vercel GitHub app on the repository).
2. **You:** Root Directory `apps/web` and Framework Preset **Next.js** (Settings > Build and Deployment). Both matter: with the repository root as the root directory, Vercel does not detect Next.js, fails with "No Output Directory named public", and ignores `apps/web/vercel.json`, so the app builds outside London. Leave the build and install commands on their defaults; keep "Include files outside the root directory" on, since the app uses workspace packages.
3. **You:** Environment Variables. Set each for **all environments** unless noted: a variable scoped to Production only still fails every preview build, because the app checks its settings at build time.

   | Name | Value |
   |---|---|
   | `APP_ENV` | `preview` (until launch in M6) |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://yvxuarrrvgnfcjfyqfyi.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the publishable key |
   | `SUPABASE_SECRET_KEY` | a secret key (mark as Sensitive) |
   | `NEXT_PUBLIC_APP_URL` | Production only: `https://maxterzhub.co.uk`. Leave it unset for Preview |
   | `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED` | `true` once section 3.4 is done |

   Payments, email and SMS providers keep their fake and log defaults until their milestones. Supabase Auth sends auth emails and texts itself.
4. **You:** Deployment Protection: keep Standard Protection, so previews need a Vercel login.
5. **You:** Domains: add `maxterzhub.co.uk` (and `www` redirecting to it), then create the DNS records Vercel shows.
6. Check: the preview URL loads, `/api/health` returns `ok`, and a seeded account signs in (M0-32 done-when).

### 3.6 GitHub

**You:** Settings > Branches: protect `main` and require the CI checks `Lint, types and unit tests`, `Database tests and lint` and `End to end (390 and 1440 px)`.

## 4. Routine operations

### Database changes
- Create: `pnpm db:migration <name>`, write the SQL, add pgTAP tests, then run `pnpm db:reset`, `pnpm db:test`, `pnpm db:lint` and `pnpm db:types`.
- A migration is frozen once merged to `main` or applied to a shared database (D-045).
- Deploy to staging after merging: `pnpm supabase db push --dry-run`, then `pnpm supabase db push`. M6 automates this in CI.

### Secrets
- They live in Vercel (app), the Supabase dashboard (Auth providers, SMTP), and `.env.local` on developer machines. None are in git; CI needs none today.
- To rotate the Supabase secret key: create a new one, update Vercel, redeploy, then delete the old one.

### Something is wrong
- Is the app up? Check `/api/health`.
- Logs: Vercel project > Logs (the app). Supabase > Logs (Auth, API, Postgres).
- Roll back the app: Vercel > Deployments > promote the previous deployment.
- Roll back the database: write a forward fix as a new migration. The free plan has no point-in-time recovery (D-032).
