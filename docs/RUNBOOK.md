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
2. **You:** in Vercel set `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (`mailto:` and an address a push service can reach you at). Staging and production get their own pair.
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
5. **You:** Domains: add `app.doovor.com` for the app, and `doovor.com` (with `www` redirecting to it) for the public site, then create the DNS records Vercel shows: usually a CNAME for `app` and an A record for the bare domain. Both point at this project for now. The app sends an app address opened on `doovor.com` to `app.doovor.com`, and `doovor.com` keeps only its own pages (D-084); when the marketing site is built somewhere else, move `doovor.com` there and nothing in the app changes.
6. Check: the preview URL loads, `/api/health` returns `ok`, and a seeded account signs in (M0-32 done-when).

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
6. Webhooks, locally: `pnpm stripe:listen` (`stripe listen --forward-connect-to
   localhost:3000/api/webhooks/stripe`) prints a signing secret of its own. It goes in
   `STRIPE_CONNECT_WEBHOOK_SECRET`. Direct charges raise their events on the connected account, so a
   plain `--forward-to` never sees them.
7. Webhooks, hosted: waits for a URL Stripe can reach. Preview deployments are behind Vercel
   Authentication and a webhook to one is refused, so the endpoint is created in M6 against
   `https://app.doovor.com/api/webhooks/stripe` (D-084). It listens on `account.updated`,
   `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.amount_capturable_updated`
   (a request's card authorised, M3-08), `payment_intent.canceled`, `refund.created`, `refund.updated`,
   `refund.failed` (refunds reconciled, including ones made in the Stripe dashboard, M3-17) and
   `charge.dispute.created`, with "Listen to events on connected accounts" ticked, and its secret goes in
   `STRIPE_CONNECT_WEBHOOK_SECRET`. `charge.refunded` is not needed: newer API versions leave the refunds
   out of it, and the refund events carry them.
   `STRIPE_WEBHOOK_SECRET` is for platform events (Stripe Billing, M5) and stays empty until then.
8. **You:** live mode needs the Connect platform onboarding questionnaire finished (Platform profile >
   View onboarding): company identity, the business model and the loss liability elections.

### 3.7a The Stripe test-mode run (M3-23)

M3 is done when acceptance tests 3 to 6 pass against Stripe test mode, webhook replay included, and
acceptance-12 books with a card. Those runs are in `e2e/specs/stripe/acceptance.spec.ts` and only run
from `pnpm test:e2e:stripe`; every other run stays on the fake.

1. **You, done on 14 September:** the platform profile acknowledgements in 3.7 step 4, and
   `stripe login` on this machine.
2. **You:** `pnpm stripe:test-account`. It makes the Express test account for the seeded school the
   way the app makes one, keeps its id in `.env.local` as `E2E_STRIPE_ACCOUNT_ID`, and prints the
   link to Stripe's onboarding. Finish onboarding with the test values Stripe offers on each step,
   then run the command again: it says when the account can take cards. It refuses a live key.
   Claude's permission checks stop at creating a connected account, even in test mode, so this
   step is yours.
3. **Claude:** in `.env.local`, set `PAYMENTS_PROVIDER=stripe`, and put the secret that
   `stripe listen --print-secret` prints in both `STRIPE_WEBHOOK_SECRET` and
   `STRIPE_CONNECT_WEBHOOK_SECRET`. The app wants both set when Stripe is on, and the listener
   signs everything with the one secret.
4. **Claude:** start `pnpm dev`, `pnpm stripe:listen` and `pnpm dev:jobs`, each running on its own.
   /dev/events is closed with Stripe, so the job runner sends refunds and notifications.
5. **Claude:** `pnpm test:e2e:stripe`. It types Stripe's test card into the card form (D-099), waits
   for Stripe's events through the listener and for the job runner, checks Stripe's own record of
   each payment and refund, and for acceptance-06 delivers one real event twice more, signed as
   Stripe signs it. If a permission check stops Claude here too, run it yourself: the output says
   what failed.
6. Afterwards set `PAYMENTS_PROVIDER=fake` again and stop the listener and the runner, so every
   other run stays offline.

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
