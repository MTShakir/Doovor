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

### 3.1 Supabase (project `Doovor`)

1. **You:** check the project region is London (`eu-west-2`). If not, create a new free project in London and remove the old one. Data must stay in the UK.
2. Link and apply the migrations:
   ```bash
   pnpm supabase login
   pnpm supabase link --project-ref yvxuarrrvgnfcjfyqfyi
   pnpm supabase db push --dry-run
   pnpm supabase db push
   ```
3. Check the session sign-out guard is active (D-041): in the SQL editor, `select rolconfig from pg_roles where rolname = 'authenticator';` must include `pgrst.db_pre_request=private.check_request`.
4. **You:** turn on leaked password protection: Authentication > Sign In / Providers > Password > "Prevent use of leaked passwords". Supabase checks a new password against HaveIBeenPwned without ever sending it. The CLI has no config key for it, so it cannot live in `ops/staging/supabase/config.toml` with the rest (M1 security advisor). Supabase offers it on the Pro plan and above: the free staging project has it off (checked 18 September 2026), so it is switched on for production.
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
8. Check the app is reachable at `https://app.doovor.com` once Vercel is connected, then sign in once to confirm emails arrive and their links open the app. The site URL and redirect URLs pushed in step 6 come from `brand.appUrl`.
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

1. **You:** add the domain `doovor.com` and create the DNS records Resend shows (SPF, DKIM and DMARC) at the domain's DNS provider. Wait for "Verified".
2. **You:** create an API key with sending access to that domain only. It goes into the Supabase SMTP settings.
3. **You:** create a second API key, also sending to that domain only, for the app's own emails (M2-28). Put it in Vercel as `RESEND_API_KEY` and set `EMAIL_PROVIDER=resend` there. Two keys rather than one, so revoking the app's key never stops a password reset.
4. Without the key the app uses the local provider: it writes a line to the log and sends nothing, which is what every local and test run does.

### 3.2a Web push (VAPID)

1. **You:** generate a key pair: `npx web-push generate-vapid-keys`. It needs no account anywhere; the pair only identifies this application to push services.
2. **You:** in Vercel set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` as Config and `VAPID_PRIVATE_KEY` as Secret, for Production and Preview (done for staging on 15 September 2026). `VAPID_SUBJECT` may stay unset: it defaults to the support address in brand.ts. Staging and production get their own pair.
3. Changing the public key invalidates every subscription: browsers have to turn push on again. Generate once and keep it.
4. Locally, `pnpm db:env` leaves these blank and the settings screen says push is not set up here. A pair for local work is generated the same way.

### 3.3 Twilio (text codes)

1. **You:** create a Messaging Service with the alphanumeric sender `Doovor` (UK senders need no registration; people cannot reply).
2. **You:** Messaging > Geo permissions: allow the United Kingdom only. Set a low monthly spend limit. Public code endpoints attract SMS pumping fraud, and this caps the damage.
3. **You:** enter the Account SID, Auth Token and Messaging Service SID in the Supabase phone provider.
4. **You:** for the app's own reminders (M2-30), put the same three values in Vercel as `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_MESSAGING_SERVICE_SID`, and set `SMS_PROVIDER=twilio`. Without them the app writes a line to the log and texts nobody, which is what every local and test run does. Reminders are the only thing that texts, and only on a plan that includes it: 200 a month on Pro, counted in `sms_usage`.

### 3.4 Google sign-in

1. **You:** in Google Cloud, for OAuth client `647142621690-...`:
   - Authorised redirect URI: `https://yvxuarrrvgnfcjfyqfyi.supabase.co/auth/v1/callback`.
   - Authorised JavaScript origin: `https://app.doovor.com`, where the sign-in button is (D-084).
2. **You:** copy the client secret into the Supabase Google provider.
3. Set `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true` in Vercel. The button stays hidden until then.
4. Locally (optional): add `http://127.0.0.1:54321/auth/v1/callback` as a redirect URI, put the client ID and secret in `.env.local` (`SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`, `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`), set `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true`, then run `pnpm db:stop` and `pnpm db:start`.

### 3.5 Vercel (team `Doovor`)

1. **You:** New Project, import `MTShakir/Doovor` (this installs the Vercel GitHub app on the repository).
2. **You:** Root Directory `apps/web` and Framework Preset **Next.js** (Settings > Build and Deployment). Both matter: with the repository root as the root directory, Vercel does not detect Next.js, fails with "No Output Directory named public", and ignores `apps/web/vercel.json`, so the app builds outside London. Leave the build and install commands on their defaults; keep "Include files outside the root directory" on, since the app uses workspace packages.
3. **You:** Environment Variables. Set each for **all environments** unless noted: a variable scoped to Production only still fails every preview build, because the app checks its settings at build time.

   | Name | Value |
   |---|---|
   | `APP_ENV` | `preview` (until launch in M6) |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://yvxuarrrvgnfcjfyqfyi.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the publishable key |
   | `SUPABASE_SECRET_KEY` | a secret key (mark as Sensitive) |
   | `NEXT_PUBLIC_APP_URL` | Production only: `https://app.doovor.com`. Leave it unset for Preview |
   | `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED` | `true` once section 3.4 is done |

   Payments, email and SMS providers keep their fake and log defaults until their milestones. Supabase Auth sends auth emails and texts itself.
4. **You:** Deployment Protection: keep Standard Protection, so previews need a Vercel login.
5. **You:** Domains: add `app.doovor.com` for the app, and `doovor.com` (with `www` redirecting to it) for the public site, then create the DNS records Vercel shows: usually a CNAME for `app` and an A record for the bare domain. Both point at this project for now. `doovor.com` must serve the project, with no redirect of its own: a redirect from `doovor.com` to `app.doovor.com` sends every public page to the app, which sends it back to the public site, and the two loop. Only `www.doovor.com` redirects, to `doovor.com`. After a deployment that makes new pages public, give the caches a moment: the app's own move from the bare domain to the app is temporary so nothing stays redirected (D-134). The app sends an app address opened on `doovor.com` to `app.doovor.com`, and `doovor.com` keeps only its own pages (D-084); when the marketing site is built somewhere else, move `doovor.com` there and nothing in the app changes.
6. Check: the preview URL loads, `/api/health` returns `ok`, and a seeded account signs in (M0-32 done-when).

### 3.5a Map (Mapbox)

1. **You:** in Mapbox, Tokens, create a public token with the default public scopes, restricted to `https://app.doovor.com` and `http://localhost:3000` (done 15 September 2026, "Doovor app"). A restricted token only works on those addresses, so a copy that leaks draws nobody else's maps on this account.
2. **You:** in Vercel, add `NEXT_PUBLIC_MAPBOX_TOKEN` as Config, Production only: preview deployments are not on a restricted address, so they keep the drawn circle (D-058). Locally, the same line goes in `.env.local`.
3. A value starting with `NEXT_PUBLIC_` is built into the app, so a change needs a new deployment, not just a restart.

### 3.6 GitHub

**You:** Settings > Branches: protect `main` and require the CI checks `Lint, types and unit tests`, `Database tests and lint` and `End to end (390 and 1440 px)`.

### 3.7 Stripe (payments, PAY-01)

Connect Express with direct charges (D-011): the Business is the merchant of record, so every
call carries the connected account, and the card fees, refunds and disputes are theirs.

Sandbox `Doovor sandbox`, account `acct_1UFF4RDP3EG8YZIf`. Settings > Connect:

1. **Done:** Onboarding options > Countries: the United Kingdom is on, and connected accounts get
   both **Transfers** and **Payments**. Transfers alone is what the sandbox started with and it is
   not enough: a direct charge against an account without `card_payments` is refused.
2. **Done:** Onboarding options > Set up their products: Cards is on.
3. **Done:** Express Dashboard > Features: "View payments" and "Edit payout schedule" are on, so an
   owner can see their money and choose when it lands (PRD section 6 roles). "Issue refunds" stays
   **off** on purpose (D-077).
4. **You:** Settings > Connect > Platform profile: press **Acknowledge** on "Refunds and chargebacks
   liability acknowledgement" and on "Ongoing seller compliance acknowledgement". Stripe creates no
   connected account, not even a test one, until both are signed, so this blocks the Stripe test mode
   acceptance run (M3-23). They commit the platform to negative balances and to refunds and
   chargebacks a connected account cannot cover, which is the company's to sign.
5. **You:** Developers > API keys. Put the test keys straight into `.env.local`, which is git ignored,
   rather than into chat or the repository: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (`pk_test_...`) and
   `STRIPE_SECRET_KEY` (`sk_test_...`). Leave `PAYMENTS_PROVIDER=fake` until M3-23; the fake is what
   every test run uses, and the keys sit unused until the provider is switched to `stripe`.
6. Webhooks, locally: `pnpm stripe:listen` runs `stripe listen --forward-connect-to
   localhost:3000/api/webhooks/stripe` as the account whose test key is in `.env.local`, whatever
   account `stripe login` last signed in to, and keeps the listener's signing secret in
   `STRIPE_WEBHOOK_SECRET` and `STRIPE_CONNECT_WEBHOOK_SECRET` without printing it. Restart the app
   afterwards: it reads `.env.local` when it starts. Direct charges raise their events on the
   connected account, so a plain `--forward-to` never sees them. On 14 September the CLI was signed in
   to the main Doovor account rather than the sandbox, and forwarded nothing.
7. Webhooks, hosted: waits for a URL Stripe can reach. Preview deployments are behind Vercel
   Authentication and a webhook to one is refused, so the endpoint is created in M6 against
   `https://app.doovor.com/api/webhooks/stripe` (D-084). It listens on `account.updated`,
   `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.amount_capturable_updated`
   (a request's card authorised, M3-08), `payment_intent.canceled`, `refund.created`, `refund.updated`,
   `refund.failed` (refunds reconciled, including ones made in the Stripe dashboard, M3-17) and
   `charge.dispute.created`, with "Listen to events on connected accounts" ticked, and its secret goes in
   `STRIPE_CONNECT_WEBHOOK_SECRET`. `charge.refunded` is not needed: newer API versions leave the refunds
   out of it, and the refund events carry them.
   `STRIPE_WEBHOOK_SECRET` is for platform events, which only Stripe Billing raises. Subscriptions
   arrive with ADM-10 in Phase 2 (D-022), so it stays empty and the app does not ask for it (D-153).
8. **You:** live mode needs the Connect platform onboarding questionnaire finished (Platform profile >
   View onboarding): company identity, the business model and the loss liability elections.
9. **You, when going live:** four values in Vercel, scoped to **Production only** and set in the same
   deployment that sets `APP_ENV=production`. All of them come from the main Doovor account in live
   mode, not from the sandbox:

   | Name | Value |
   |---|---|
   | `PAYMENTS_PROVIDER` | `stripe` |
   | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | the live publishable key, `pk_live_...` |
   | `STRIPE_SECRET_KEY` | the live secret key, `sk_live_...` (mark as Sensitive) |
   | `STRIPE_CONNECT_WEBHOOK_SECRET` | the signing secret of the live endpoint in step 7 (mark as Sensitive) |

   The app refuses to start with a live key anywhere but production, and with a test key in
   production (D-153), so a live key set for Preview, or before `APP_ENV` changes, stops the build
   with the key's name rather than taking real money for demo data. Supabase needs nothing from
   Stripe: only the app talks to it.

### 3.7a The Stripe test-mode run (M3-23)

M3 is done when acceptance tests 3 to 6 pass against Stripe test mode, webhook replay included, and
acceptance-12 books with a card. Those runs are in `e2e/specs/stripe/acceptance.spec.ts` and only run
from `pnpm test:e2e:stripe`; every other run stays on the fake.

1. **You, done on 14 September:** the platform profile acknowledgements in 3.7 step 4. The Stripe CLI
   is installed; the listener signs in with the key in `.env.local` (3.7 step 6).
2. **You, done on 14 September (`acct_1UFhbxDLGcFcDy7q`):** `pnpm stripe:test-account`. It makes the Express test account for the seeded school the
   way the app makes one, keeps its id in `.env.local` as `E2E_STRIPE_ACCOUNT_ID`, and prints the
   link to Stripe's onboarding. Finish onboarding with the test values Stripe offers on each step,
   then run the command again: it says when the account can take cards. It refuses a live key.
   Claude's permission checks stop at creating a connected account, even in test mode, so this
   step is yours.
3. **Claude:** in `.env.local`, set `PAYMENTS_PROVIDER=stripe`.
4. **Claude:** start `pnpm stripe:listen` first, since it writes the webhook secrets, then `pnpm dev`
   and `pnpm dev:jobs`, each running on its own. /dev/events is closed with Stripe, so the job
   runner sends refunds and notifications.
5. **Claude:** `pnpm test:e2e:stripe`. It types Stripe's test card into the card form (D-099), waits
   for Stripe's events through the listener and for the job runner, checks Stripe's own record of
   each payment and refund, and for acceptance-06 delivers one real event twice more, signed as
   Stripe signs it. If a permission check stops Claude here too, run it yourself: the output says
   what failed.
6. Afterwards set `PAYMENTS_PROVIDER=fake` again and stop the listener and the runner, so every
   other run stays offline.

### 3.8 Job runner (Inngest)

1. **You:** sign in to Inngest. From Inngest, Settings, Integrations, Vercel, add the integration to the `Doovor` team for the `doovor` project (done 15 September 2026). It adds `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` to the project itself and registers the app's functions on each deployment. Nobody types either key.
2. In the integration's settings for `doovor`, set Custom Production Domain to `app.doovor.com`. Without it, Inngest registers through the deployment's own `vercel.app` address, which Deployment Protection (section 3.5 step 4) turns away, and the sync fails with "We could not reach your URL".
3. To register at once rather than on the next deployment: Inngest, Apps, Sync new app, `https://app.doovor.com/api/inngest`. The app appears as `platform-web` with its functions, and the scheduled ones start within a minute.
4. Preview deployments do not register while Deployment Protection is on. They need no jobs today; if they ever do, add Vercel's Protection Bypass for Automation secret in the same settings.
5. `/api/inngest` answers a plain request with 401 Unauthorized once the signing key is set: it only talks to Inngest.

## 4. Routine operations

### Database changes
- Create: `pnpm db:migration <name>`, write the SQL, add pgTAP tests, then run `pnpm db:reset`, `pnpm db:test`, `pnpm db:lint` and `pnpm db:types`.
- A migration is frozen once merged to `main` or applied to a shared database (D-045).
- Deploy to staging after merging: `pnpm supabase db push --dry-run`, then `pnpm supabase db push`. M6 automates this in CI.

### Dependencies
- Weekly pull requests from Dependabot (`.github/dependabot.yml`): minor and patch versions in one
  grouped pull request, a major version on its own. Read the notes, let CI run, then merge; a major
  version that needs work becomes a task rather than a merge.
- `pnpm audit --audit-level=high` runs in CI. Raise a version above what its dependent asks for with
  `overrides` in `pnpm-workspace.yaml`. An advisory with no fixed version goes in `auditConfig.ignoreGhsas`
  in the same file, with the reason and the date it was read, and comes out when a fix exists (M6-02).
- Licences: `pnpm licenses list`. Nothing under the GPL or AGPL may be added; `docs/SECURITY.md` lists
  what is there today.

### Going to production (M6-15)

Run through this before every production deploy. Anything unticked stops the deploy.

1. **CI is green on the commit being deployed**: lint and types, unit tests, database tests, the end
   to end suite at both widths, Lighthouse on the public pages, and the load tests. Check the run,
   not the badge.
2. **The twelve acceptance tests ran**: they are part of the end to end suite, and
   `e2e/specs/acceptance-roll-call.spec.ts` fails if one has been renamed, deleted or skipped.
3. **No open P1**: see below. A P1 open means no deploy except the fix.
4. **Migrations are forward only and already on staging**: they were pushed to staging, the app
   there works, and nothing in `supabase/migrations` has been edited since. A merged migration is
   frozen; fix it with another.
5. **Generated types match the migrations**: CI checks this; `pnpm db:types` and a clean `git diff`
   say it locally.
6. **Secrets are set for Production in Vercel**: the ones `.env.example` lists, with
   `INNGEST_SIGNING_KEY` and `FIELD_ENCRYPTION_KEYS` present, which the app refuses to start
   without, and the four Stripe values in section 3.7 step 9.
7. **A backup exists from today**, and you know which point to go back to (see backups below).
8. **Watching is on**: the Sentry DSN is set, the uptime check is green, and an alert reaches a
   phone.
9. **Deploy**, then within five minutes: open the public home page, a city page, a profile and a
   booking link; sign in as an instructor; open the diary; take a test payment in Stripe test mode
   if payments changed.
10. **If something is wrong**, roll back first and diagnose afterwards: Vercel keeps the previous
    deployment and promoting it is one click. A migration does not roll back with it, which is why
    migrations are forward only.

### P1 bugs (M6-15)

- **A P1 is** anything that loses money, loses data, lets somebody see another Business's data,
  stops a learner booking or paying, stops an instructor seeing their day, or takes the public site
  down. Nothing else is a P1, however annoying.
- **Where they live**: GitHub issues on `MTShakir/Doovor`, labelled `P1`, one per bug, with what
  happened, who it happened to, and how to see it again.
- **What happens**: a P1 stops other work. Write the failing test first, fix it, ship it, then write
  what went wrong and what stops it happening again in `docs/DECISIONS.md`.
- **Right now**: none open.

### Backups and going back (M6-14)

- **What exists depends on the plan.** The free plan keeps no backup that can be restored: on 18
  September 2026 the project, on the free plan, listed no backups and no point in time recovery
  (Management API, `database/backups`). Pro keeps a daily backup for seven days. Point in time
  recovery, which is what lets you go back to a minute rather than a day, is a paid add on above
  that (D-032). Data that matters needs Pro at the least.
- **Product owner, before beta:**
  1. Put production on the Pro plan, then note what it has: daily backups only, or point in time
     recovery and the window it covers.
  2. Do a restore drill into a throwaway project: restore yesterday's backup, point a local checkout
     at it with that project's URL and keys, and check a learner's lessons, payments and receipts
     are all there. Write down how long the restore took.
  3. Delete the drill project, and record the date and the time it took in `docs/PROGRESS.md`.
- **Going back for real**: restore from the dashboard, then redeploy the app unchanged. Everything
  written after that point is gone, so tell the people affected which window was lost. A restore is
  a last resort: one bad migration is better fixed forward.

### A learner says they were charged twice (M6-13)

1. **Find the payments.** Admin, Learners, open them, and read their payments. Two rows for one
   lesson is a double charge; one row and two card statements is the bank showing an authorisation
   and a capture, which is not.
2. **Check what the provider says.** Stripe dashboard, search the learner's email, and compare the
   charges with `public.payments`. `provider_ref` on each row is the Stripe id.
3. **If the product took two payments**, refund the later one from the app rather than from Stripe,
   so the ledger, the receipt and the audit trail agree: Admin, the learner, the payment, Refund.
   A refund made in Stripe alone leaves our record wrong.
4. **If Stripe shows two charges and the app one**, the webhook missed one. The app records a
   payment once per provider event (acceptance-06), so look in `public.provider_events` for the
   event id: if it is absent, replay it from Stripe, which is safe because a repeat is ignored.
5. **Tell them what happened and when the money returns**: a card refund is with them in five to
   ten working days, and the app emails the receipt.
6. **Write it down.** If the cause was ours, it is a P1 until fixed.

### Rotating a key (M6-13)

Every one of these is: create the new, set it in Vercel, redeploy, check, then delete the old.

- **Supabase secret key**: create a new one, update Vercel, redeploy, delete the old.
- **Stripe**: roll the secret key in the Stripe dashboard, update `STRIPE_SECRET_KEY`, redeploy, then
  take one test payment. The webhook secrets are separate: rolling an endpoint's secret means
  updating `STRIPE_WEBHOOK_SECRET` or `STRIPE_CONNECT_WEBHOOK_SECRET` in the same deploy, or
  deliveries are refused.
- **Resend and Twilio**: create a new key, update Vercel, redeploy, send one message to yourself.
- **Web push (VAPID)**: a new pair invalidates every subscription. Only rotate if the private key
  has leaked, and tell people they will have to turn notifications on again.
- **Field encryption (`FIELD_ENCRYPTION_KEYS`)**: add the new key at the front of the ring, keeping
  the old one, so anything already encrypted can still be read. Remove the old key only once
  nothing uses it (D-010).

### Watching for errors and outages (M6-10)
- Errors are reported by `@sentry/nextjs`, started in `apps/web/src/lib/errors/sentry.ts`, from the
  browser, the server and the jobs. With no `NEXT_PUBLIC_SENTRY_DSN` it does nothing at all, which
  is how a developer's machine and the test runs stay quiet.
- Every report passes through `apps/web/src/lib/errors/reporting.ts` first, which drops the query
  string, the cookies and the body, removes any header whose name says it is a secret, keeps only
  the account id of the person it happened to, and never records a session (D-150).
- **To switch it on (product owner):**
  1. Create a Sentry project in the EU region. Copy the DSN into `NEXT_PUBLIC_SENTRY_DSN` in Vercel,
     for Preview and Production.
  2. Confirm the wiring on a laptop first: put the DSN in `.env.local` for one run, build, open
     `/dev/error`, which throws on purpose, and look for it in Sentry within a minute. Then take it
     back out of `.env.local`. `/dev` routes answer only on a developer's machine and in the test
     runs (M6-01), so there is nothing to press on staging; there, the proof is the first real
     error arriving after the deploy.
  3. Set an alert rule: any new issue in Production to email, and more than 10 of the same issue in
     5 minutes to the phone.
  4. Uptime: a check every minute on `https://app.doovor.com/api/health` (Sentry Crons, Better Stack
     or UptimeRobot all do this), alerting after two failures so one slow response is not an alarm.
  5. For readable stack traces, set `SENTRY_AUTH_TOKEN`, flip `'@sentry/cli'` to `true` in
     `pnpm-workspace.yaml` and wrap `next.config.ts` with `withSentryConfig`. Not done here, because
     it changes the build for everybody and buys nothing until step 1 is done.

### Load tests (M6-05)
- `pnpm load` runs both, against the local stack and a build of the app on port 3000. It builds
  `load/fixtures.json` first, from the seeded database, runs the reads and then the booking scenario,
  and cancels afterwards what the booking run booked.
- The thresholds are the requirement, so k6 fails the run if it is missed: p95 under 300 ms for the
  reads, under 600 ms for a booking (NFR-PERF-02). A whole page has its own, looser threshold,
  because the requirement for a page is NFR-PERF-01 and Lighthouse holds that one.
- It runs in CI on every push, against a fresh stack and a production build, and the timings are in
  the job's annotations. `pnpm load` needs k6 on the machine (`winget install k6` or
  `brew install k6`); CI installs it itself.
- If a run leaves bookings behind, `pnpm load:clean` cancels them. It only ever touches what a load
  run booked: the learners in `load/fixtures.json`, from three weeks out.
- The fixtures file holds the tokens of seeded local accounts, so it is ignored by git. It never
  points anywhere but the local stack, and the scripts refuse to run if it does.

### Secrets
- `pnpm db:env --force` refreshes the local stack's keys and keeps everything else already in
  `.env.local`, copying the old file aside first (D-145). It used to rewrite the whole file, which
  threw away every key pasted in by hand; if that has happened, the public values can be recovered
  from `apps/web/.next`, where a build bakes them in, and the secret ones cannot.

- They live in Vercel (app), the Supabase dashboard (Auth providers, SMTP), and `.env.local` on developer machines. None are in git; CI needs none today.
- To rotate the Supabase secret key: create a new one, update Vercel, redeploy, then delete the old one.

### Something is wrong
- Is the app up? Check `/api/health`.
- Logs: Vercel project > Logs (the app). Supabase > Logs (Auth, API, Postgres).
- Roll back the app: Vercel > Deployments > promote the previous deployment.
- Roll back the database: write a forward fix as a new migration. The free plan has no point-in-time recovery (D-032).
