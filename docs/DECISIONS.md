# Decisions log

Every decision made without the product owner, newest last. Format: date, decision, options considered, reason. Entries marked **Confirm** are defaults already applied that the product owner may want to overrule.

## D-001 | 2026-09-11 | Buffer applied once, after each lesson | Confirm
- **Decision:** `blocked_range = [starts_at, ends_at + buffer)`. The instructor needs a gap of one buffer between lessons.
- **Options:** (a) R-01 literally: pad both sides of every booking; (b) half the buffer on each side; (c) buffer after each lesson.
- **Reason:** R-01 read literally makes two padded bookings need twice the buffer, which fails PRD acceptance test 1 (with a 30 minute buffer, 11:30 after a 10:00 to 11:00 lesson must succeed). The acceptance test is the concrete product behaviour. Option (c) passes it exactly, keeps the brief's exclusion-constraint design, and is the easiest to explain ("30 minutes after each lesson"). Option (b) also passes but behaves oddly when buffers differ.

## D-002 | 2026-09-11 | Blocking statuses include `pending_payment` and `completed`
- **Decision:** The exclusion constraints apply to `pending_payment`, `requested`, `confirmed`, `in_progress` and `completed`.
- **Options:** The brief's list (`requested`, `confirmed`, `in_progress`) only; or add the two statuses.
- **Reason:** A short checkout hold must block the slot or two learners could pay for the same lesson. A completed lesson still occupied that time, and R-02 does not list `completed` either way. `cancelled`, `no_show`, `declined` and `expired` stay non-blocking as R-02 requires.

## D-003 | 2026-09-11 | TypeScript 6.0.x, not 7.0
- **Decision:** Pin TypeScript 6.0.3.
- **Options:** TypeScript 7.0.2 (latest, native compiler) or 6.0.3.
- **Reason:** typescript-eslint 8.70 (latest) supports TypeScript `>=4.8.4 <6.1.0`. Type-aware linting is part of the Definition of Done. Revisit when typescript-eslint supports 7.

## D-004 | 2026-09-11 | Node 24 LTS as the runtime
- **Decision:** Target Node 24 LTS (24.21.0 today) in `.nvmrc`, `engines` and Vercel.
- **Options:** Node 22 (installed here: 22.12.0), Node 24 LTS, Node 26 (current, not LTS).
- **Reason:** ESLint 10 needs Node `^22.13.0 || >=24`; the machine has 22.12.0. Node 24 is the active LTS.

## D-005 | 2026-09-11 | Neutral package scope and brand tokens from brand.ts
- **Decision:** Workspace packages use `@repo/*`. `<BrandStyle />` writes the colours in `brand.ts` as CSS variables in the page head, and the Tailwind theme maps utilities such as `bg-yellow` to them. A CI copy guard fails the build on the brand name, domain or brand hex values outside `brand.ts`, and on em or en dashes. *Amended during M0: the first version generated a token CSS file at build time.*
- **Options:** Brand-named scope (`@drivinghub/*`); hand-written token CSS; a build step that generates token CSS.
- **Reason:** The brief requires a rename to be a one-file change. Runtime variables need no build step or git-ignored generated file, and editing `brand.ts` hot-reloads.

## D-006 | 2026-09-11 | Supabase publishable and secret keys
- **Decision:** Use `sb_publishable_...` and `sb_secret_...` keys. `.env.example` names them `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`, with comments mapping them to the old anon and service role keys.
- **Options:** Legacy anon and service role JWT keys, as named in the brief.
- **Reason:** Supabase retires the legacy keys by the end of 2026. Secret keys also refuse browser requests, which adds a guardrail.

## D-007 | 2026-09-11 | Portals under `/app`, admin under `/admin`
- **Decision:** `/app/learner`, `/app/instructor`, `/app/school`, `/admin`. The active Business is held in a validated cookie, not in the URL.
- **Options:** Top-level `/learner`, `/instructor`; subdomain per portal.
- **Reason:** Keeps product routes apart from the PRD 8.3 SEO URLs (`/instructors/...`, `/learners`), makes `noindex` and auth matching one rule, and needs no extra domains.

## D-008 | 2026-09-11 | Postgres rate limiter behind an interface
- **Decision:** Supabase Auth's built-in limits for auth endpoints. A Postgres fixed-window limiter (`private.rate_limit_hit`) for booking, invite and messaging actions, behind a `RateLimiter` interface.
- **Options:** Upstash Redis; Vercel WAF rate limiting.
- **Reason:** No extra vendor or cost at Phase 1 scale. The interface lets us move to Redis if load demands it.

## D-009 | 2026-09-11 | Contrast rules where the PRD palette fails WCAG 2.2 AA
- **Decision:** Placeholders use grey-700, not grey-400. "Paid" and "Completed" pills use a green fill with black text. Red and blue text only on white. Selected slots add a black border to the yellow fill. Input boundaries use grey-700.
- **Options:** Follow PRD 7.2 literally; add new colour tokens.
- **Reason:** Measured ratios: grey-400 on white 2.19:1, green on white 3.29:1, yellow on white 1.43:1, grey-200 on white 1.30:1. WCAG 2.2 AA is a hard requirement (PRD 14.4). These rules keep the PRD palette with no new colours.

## D-010 | 2026-09-11 | Application-level field encryption
- **Decision:** AES-256-GCM with Node's built-in crypto, versioned keys in `FIELD_ENCRYPTION_KEYS`, for the licence number now and the test booking reference in Phase 2. Instructors never see the value.
- **Options:** pgsodium transparent column encryption; Supabase Vault.
- **Reason:** Supabase no longer recommends pgsodium column encryption for new projects, and Vault is designed for secrets, not per-row data. The brief allows either route.

## D-011 | 2026-09-11 | Stripe direct charges on connected accounts | Settled 13 September 2026
- **Decision:** Build on direct charges with Express accounts behind `PaymentsProvider`.
- **Options:** Direct charges (Business is merchant of record); destination charges (platform is merchant of record).
- **Reason:** Matches the PRD: money goes to the Business, card fees pass through, no platform wallet (PAY-12), receipts carry the Business name. PRD section 20 needs solicitor and Stripe sign-off before M3 goes live.
- **Settled:** The product owner asked for the call to be made for them and it is made: direct charges. The deciding reason is regulatory. Destination charges put the money in a Doovor balance before it reaches the instructor, which is holding client money: in the United Kingdom that is the road to authorisation as a payment institution, with its own capital, safeguarding and audit, and it is not survivable for a company at this size. Direct charges also leave chargebacks with the Business that gave the lesson, keep card fees off our own accounts entirely, and still allow a per-booking fee later, because `application_fee_amount` works on a direct charge (Phase 3, PRD 18.2). What we give up is our name on the learner's card statement and any ability to pay an instructor before their learner has paid, neither of which we want. The residual risk is that Stripe holds the platform liable for a connected account that goes negative and cannot cover it, which is what the platform profile acknowledgement says; it is managed by leaving payouts on their default delay rather than by changing the charge type. Solicitor sign-off before launch is still outstanding (PRD section 20).

## D-012 | 2026-09-11 | MFA required for owners of school Businesses only
- **Decision:** TOTP is required for Super Admin, Support Admin and owners of `school` Businesses. It is optional for independent instructors, who are technically owners of a one-person Business.
- **Options:** Require MFA for every owner membership.
- **Reason:** AUTH-08 names School Owner, not independent instructors, and forcing MFA would slow the under-5-minute onboarding.

## D-013 | 2026-09-11 | Serwist with `@serwist/turbopack`
- **Decision:** Use `@serwist/turbopack`. Fall back to `@serwist/next` with a webpack production build if the spike in M2 finds a blocker.
- **Options:** `@serwist/next` (webpack plugin); hand-built service worker.
- **Reason:** Next 16 builds with Turbopack by default. The Turbopack module compiles the worker through a route handler and needs no bundler plugin.

## D-014 | 2026-09-11 | Read-only impersonation as "view as"
- **Decision:** Staff view a user's portal with their own session (which already has read access), filtered to the target's scope, with a banner, a time limit and an audit row. All Server Actions refuse to run in view-as mode. No tokens are minted for the target user.
- **Options:** Mint a JWT for the target user with an impersonation claim.
- **Reason:** Minting tokens needs the signing key and creates a real session for someone else, which is a larger risk than the feature is worth in Phase 1.

## D-015 | 2026-09-11 | React Email through the `react-email` package
- **Decision:** Templates use `react-email` 6.
- **Options:** `@react-email/components`, as commonly documented.
- **Reason:** `@react-email/components` is marked deprecated on npm ("Package no longer supported").

## D-016 | 2026-09-11 | Realtime as an invalidation signal only
- **Decision:** Database triggers broadcast `{ table, id, action }` to private channels protected by RLS on `realtime.messages`. Clients refetch through RLS.
- **Options:** `postgres_changes` subscriptions carrying row data.
- **Reason:** No row data leaves through subscriptions, and broadcast scales better than per-subscriber RLS checks on change streams.

## D-017 | 2026-09-11 | Transactional outbox for job events
- **Decision:** RPCs write `outbox_events` in the same transaction. A dispatcher sends them to Inngest, with a one-minute sweep.
- **Options:** Send to Inngest directly from Server Actions after the RPC returns.
- **Reason:** A crash between the database commit and the send would lose reminders, receipts or expiries. The outbox cannot.

## D-018 | 2026-09-11 | Credit held as lots, ledger and cached balance
- **Decision:** `credit_lots` (per package purchase, consumed oldest first), append-only `credit_ledger`, and `credit_accounts` with a non-negative check, all updated in one transaction.
- **Options:** Ledger only, with the balance summed on every read.
- **Reason:** Package expiry (`expiry_days`) and refunds of unused credit need to know which purchase the minutes came from. The locked balance row makes concurrent use safe.

## D-019 | 2026-09-11 | Sensitive learner data in separate tables
- **Decision:** Private notes in `learner_notes` (no learner policy). Date of birth and the encrypted licence number in `learner_private` (self only). Instructors get an age band function.
- **Options:** Columns on `learner_relationships` and `learner_profiles` hidden by views.
- **Reason:** RLS works on rows, not columns, and learners and instructors share the `authenticated` role. Separate tables make leaks through joins or views impossible, as the brief requires.

## D-020 | 2026-09-11 | School onboarding (AUTH-05) delivered in M5
- **Decision:** Build AUTH-05 with the school portal in M5. Seed data covers schools before that.
- **Options:** Build it in M1 with instructor onboarding.
- **Reason:** The brief's milestone list does not place AUTH-05. Its invite step depends on SCH-02, which is in M5.

## D-021 | 2026-09-11 | "Coming soon" capture only in Phase 1 (MKT-10)
- **Decision:** Regions without the marketplace show "Coming soon" and store waiting-list interest and lesson requests (with a 72 hour expiry). No matching or offers until Phase 3.
- **Options:** Build lesson request matching now.
- **Reason:** MKT-10 is P1; MKT-07 matching is P3.

## D-022 | 2026-09-11 | Plan entitlements without billing in Phase 1
- **Decision:** `businesses.plan` and entitlements in config from M0. New Businesses get the Founding offer (Pro free for 12 months) while the limits of 500 instructors and 50 schools last. Subscription billing (Stripe Billing) arrives with ADM-10 in Phase 2.
- **Options:** Build Stripe Billing subscriptions in Phase 1.
- **Reason:** Plans and subscriptions are a Phase 2 item (ADM-10). Pro features in Phase 1 (SMS reminders, auto-charge) still need an entitlement check.

## D-023 | 2026-09-11 | Public buckets for avatars and logos
- **Decision:** Avatars and school logos in public buckets. Badges and receipts in private buckets with 60 second signed URLs.
- **Options:** Everything private with signed URLs.
- **Reason:** Profile photos appear on public, cached SEO pages. Signed URLs there would expire inside cached HTML.

## D-024 | 2026-09-11 | Pinned new majors with a fallback rule
- **Decision:** Pin exact latest versions: Next 16.3, React 19.3, pnpm 12.3, Turborepo 2.10, Vitest 5.0, ESLint 10.10, Tailwind 4.3, Zod 4.6, Inngest 4.20, Stripe 22.6. If a new major blocks progress, drop one major for that tool and log it here.
- **Options:** Start on the previous majors.
- **Reason:** The brief asks for the latest stable versions. The fallback rule keeps a tooling problem from stalling a milestone.

## D-025 | 2026-09-11 | Supply-chain policy for dependencies
- **Decision:** Keep pnpm's default 24 hour minimum release age. Enable `trustPolicy: no-downgrade` for releases from the last 30 days (`trustPolicyIgnoreAfter: 43200`). `allowBuilds` stays empty, so no dependency runs install scripts. "Latest stable" therefore means the newest release at least a day old; the lockfile pins exact versions.
- **Options:** pnpm defaults only; trust policy on every release.
- **Reason:** A takeover shows up as a fresh release that lost provenance. Checking every release blocked long-lived packages (for example `semver@6.3.1`) whose older lines predate npm provenance.

## D-026 | 2026-09-11 | Temporary domain maxterzhub.co.uk
- **Decision:** `brand.ts` sets the domain to `maxterzhub.co.uk` (product owner, 11 Sep 2026). URLs, senders and support addresses derive from it. Each environment's base URL comes from `NEXT_PUBLIC_APP_URL` or Vercel's variables.
- **Options:** None; set by the product owner.
- **Reason:** Changing the domain later is a one-line edit in `brand.ts`.

## D-027 | 2026-09-11 | Founding offer by business type
- **Decision:** The founding offer grants the paid plan for the business type: Pro for independent instructors, the School plan for schools, free for 12 months.
- **Options:** Pro for everyone, including schools.
- **Reason:** PRD 9.18 offers "Pro free for 12 months" to the first 50 schools too, and the School plan is the school equivalent of Pro.

## D-028 | 2026-09-11 | ESLint without eslint-config-next
- **Decision:** Use `@next/eslint-plugin-next`, `eslint-plugin-react-hooks` and `eslint-plugin-jsx-a11y` directly with typescript-eslint's strict type-checked rules.
- **Options:** `eslint-config-next`, which pulls `eslint-import-resolver-typescript@3.10.x`.
- **Reason:** That resolver line was published without the provenance its 4.x releases carry, so the trust policy (D-025) blocks it. jsx-a11y declares ESLint up to 9 but runs under ESLint 10; it already caught a real issue (an empty heading).

## D-029 | 2026-09-11 | Cache Components on from M0
- **Decision:** `cacheComponents: true` in `next.config.ts`. Session reads sit behind Suspense boundaries with skeletons, and public pages use `use cache` with tags in M5.
- **Options:** The previous caching model, migrating later.
- **Reason:** It is the Next 16 model, public SEO pages need it, and its streaming-with-skeletons pattern matches PRD 7.1. Adopting it before there are many routes avoids a migration.

## D-030 | 2026-09-11 | Phase 2 navigation hidden in Phase 1 | Flag
- **Decision:** PRD 8.2 destinations that only have Phase 2 content (instructor waiting list, school fleet and reports, admin reviews, disputes, plans and content) are in the navigation config but hidden until built.
- **Options:** Show them with "coming soon" screens.
- **Reason:** Phase 1 users should not meet empty screens. Showing them later is a one-line change per item.

## D-031 | 2026-09-11 | Not-found status under streaming
- **Decision:** In the private portals, an unknown address streams the not-found page with a 200 status and a `noindex` robots tag (documented Next behaviour once streaming starts). Public SEO pages in M5 will check the profile or area exists before streaming, so they return a real 404.
- **Options:** Force every page to render without streaming.
- **Reason:** Portals are private and `noindex`. For public pages the status code matters for SEO, so they get the check.

## D-032 | 2026-09-11 | Supabase free plan for now | Flag
- **Decision:** The product owner's `DrivingHub` project (free plan) is the staging database for previews. Production needs the Pro plan with point-in-time recovery before real users (NFR-SEC-07: daily backups and 7 day recovery).
- **Options:** Pro now; Supabase branching for pull request previews.
- **Reason:** The product owner chose the free plan at this early stage. Hosted auth emails also need a custom SMTP sender (Resend) because Supabase's built-in sender only reaches project team members.

## D-033 | 2026-09-11 | Phone codes and test numbers
- **Decision:** Phone sign-up is off; phone codes verify instructor numbers (AUTH-02) and let people with a verified number sign in. Local and CI use Ofcom drama numbers (07700 900001 to 900009) with a fixed test code, so no SMS is sent.
- **Options:** Phone-only accounts.
- **Reason:** Every account needs an email for receipts and notices. Drama numbers can never reach a real person.

## D-034 | 2026-09-11 | One root .env.local
- **Decision:** A single `.env.local` at the repository root is loaded by `next.config.ts` (with `process.loadEnvFile`) and by `scripts/supabase.mjs` for the CLI. Hosted environments use their dashboards.
- **Options:** Separate env files per app and for the Supabase CLI.
- **Reason:** One file avoids values drifting between the app, scripts and the local database.

## D-035 | 2026-09-11 | Next.js agent files committed
- **Decision:** Commit the `apps/web/AGENTS.md` and `apps/web/CLAUDE.md` that `next dev` writes, and exclude agent and readme files from the copy guard.
- **Options:** Delete or ignore them.
- **Reason:** `next dev` recreates them, and they point coding sessions to the docs bundled with this exact Next.js version. They are not product copy.

## D-036 | 2026-09-11 | Server Action arguments are never logged
- **Decision:** `logging.serverFunctions: false` in `next.config.ts`.
- **Options:** Next's default, which logs each Server Action call with its arguments in development.
- **Reason:** The dev server printed sign-in arguments, including passwords and one-time codes, to the terminal and log files. Secrets must never reach logs. Requests are still logged with their timings.

## D-037 | 2026-09-11 | Retry "JWT issued at future" from the database API
- **Decision:** The Supabase clients use a fetch wrapper that retries a REST call rejected with 401 `PGRST303` up to three times, 400 ms apart per attempt. No other error is retried.
- **Options:** Let the page fail and ask the person to refresh.
- **Reason:** Straight after sign-in, the database API can reject a brand new token as issued in the future because its clock lags by up to a second (an upstream issue, seen locally). The retry is invisible to people and scoped to that one error. Remove it when the upstream fix lands.

## D-038 | 2026-09-11 | Session-gated layouts opt out of instant validation (amends D-029)
- **Decision:** `export const instant = false` on the portal, admin and account layouts, as Next's guide for authentication with Cache Components recommends while routes block on the session. In development, Next still notes "Could not validate instant" when a page redirects on purpose (wrong portal, two-step check, unknown section). Those notes are expected, not bugs.
- **Options:** Private caching of session reads now; turning implicit validation off for the whole app.
- **Reason:** Instant authenticated navigation is an optimisation for later milestones. Public pages keep the default validation.

## D-039 | 2026-09-11 | Instructors can verify their mobile later | Confirm
- **Decision:** After confirming their email, instructors land on "Verify your mobile" (AUTH-02) with a "Do this later" option. The account page shows "Add and verify" until it is done.
- **Options:** Block the portal until the number is verified.
- **Reason:** AUTH-04 lets instructors skip every onboarding step except their name, and a hard block would stop someone without signal finishing sign-up. Making it mandatory is a one-line change in `completeSignIn` if the product owner prefers.

## D-040 | 2026-09-11 | School managers manage instructors' availability
- **Decision:** Owners and managers hold `manage_availability` for their school's instructors; every instructor manages their own. Owners can remove it per manager through membership permissions (SCH-02).
- **Options:** Read "Manage own availability" (PRD 6.2) literally, so only instructors edit hours.
- **Reason:** Managers are office staff without a diary of their own (PRD 6.1: "Instructors, learners, bookings"), so the matrix's "Yes" only makes sense as maintaining the team's hours.

## D-041 | 2026-09-11 | Signing out a device takes effect at once
- **Decision:** Before every request, the database API (PostgREST) runs `private.check_request`, which refuses a token whose session has been signed out or has passed its end time, answering 401 `SESSION_ENDED`. Page gates read access through the database (`getAccess`), so a signed-out device is sent to sign in on its next visit.
- **Options:**
  - Rely on token expiry: pages verify tokens locally (`getClaims`), so a signed-out device keeps working for up to an hour.
  - Call Supabase Auth on every request.
- **Reason:** AUTH-09 and M0-27 need global sign-out to end other sessions. Someone who has lost their phone expects it cut off now, not in an hour. The check is one primary-key lookup per request and also covers direct API use. Storage and Realtime check tokens themselves and still accept them until expiry. They arrive in M1 and later, and M6 hardening shortens the token lifetime to narrow that window.

## D-042 | 2026-09-11 | Visitor device and IP forwarded to Supabase Auth
- **Decision:** Server-side Supabase clients forward the visitor's `User-Agent` and `X-Forwarded-For` headers.
- **Options:** Sign in from the browser instead of Server Actions.
- **Reason:** Sign-in runs in Server Actions, so Supabase Auth recorded the server as the device. The devices list (AUTH-09) and the audit log (NFR-SEC-06) need the person's own device. Vercel's edge sets `x-forwarded-for`, but the recorded IP stays informational: nothing authorises on it. Staging (M0-32) will confirm which address hosted Supabase records.

## D-043 | 2026-09-11 | Forms never submit before the page is ready (security fix)
- **Decision:** Forms handled by JavaScript use `ClientForm` and `SubmitButton`:
  - they always post;
  - the submit button is disabled until React has hydrated, keeping its normal look;
  - repeat submits while pending are ignored;
  - text fields have no React Hook Form default values.
- **Options:**
  - Full progressive enhancement: `useActionState` with FormData actions.
  - Leave the forms as they were.
- **Reason:** An e2e run caught a real leak. A sign-up submitted before hydration fell back to a native GET, which put the password in the URL (`/sign-up?...&password=...`), and from there in server logs and browser history. React Hook Form's empty defaults also cleared anything typed before hydration. Full progressive enhancement would mean rewriting every auth action, and the forms need JavaScript anyway (validation, one-time codes). A regression test holds back the JavaScript bundles and checks two things: nothing is sent, and early typing survives.

## D-044 | 2026-09-11 | Viewport-only tests are tagged, not skipped
- **Decision:** A test for a flow that exists on one form factor only carries `@phone-only` or `@desktop-only`, and each Playwright project leaves out the other tag.
- **Options:** `test.skip` at run time.
- **Reason:** Milestones cannot close with skipped tests (rule 10). Tags keep the report clean and make the intent explicit.

## D-045 | 2026-09-11 | When a migration is frozen
- **Decision:** A migration is frozen once it is merged to `main` or applied to a shared database, and mistakes are then fixed with a follow-up migration. An uncommitted migration on a branch may still be edited.
- **Options:** "Forward only" for every migration, even one no other database has seen.
- **Reason:** Editing a migration no one else has applied keeps history readable. Freezing it once shared keeps every database reproducible.

## D-046 | 2026-09-11 | Email links always point at the site URL
- **Decision:** Auth email templates build links from `{{ .SiteURL }}`, and the redirect allow list holds exact URLs only, with no `*.vercel.app` wildcards. On previews, password sign-in works in place; email and Google sign-in finish on the staging domain.
- **Options:** Build links from the requested redirect URL so previews get their own links back, which needs wildcard redirect URLs.
- **Reason:** Anyone can create a Vercel project whose address matches a `*-team.vercel.app` wildcard, and could then receive sign-in tokens through a crafted reset or sign-in link. Exact URLs close that hole. Previews are for checking changes, and password sign-in covers that.

## D-047 | 2026-09-11 | Nothing is indexed outside production
- **Decision:** Outside `APP_ENV=production`, every response carries `X-Robots-Tag: noindex, nofollow` and `robots.txt` disallows everything. In production, the portals, account, auth and API paths are never indexed and public pages are.
- **Options:** Rely on Vercel's preview protection alone.
- **Reason:** Staging sits on the public brand domain before launch. Search engines indexing demo data or staging pages would compete with the real public profiles in M5 (SEO).

## D-048 | 2026-09-11 | Hosted demo data needs its own password
- **Decision:** The seed refuses a hosted project unless `SEED_PASSWORD` is set, refuses a mix of local and hosted targets, and never prints a connection string.
- **Options:** Reuse the documented local password everywhere.
- **Reason:** The local password is in the repository. On a public staging URL, anyone could sign in as the demo instructors and learners and, for example, send texts. A mixed target would create users in one project and their rows in another.

## D-049 | 2026-09-11 | Staging is the main branch deployment until launch | Confirm
- **Decision:** Until M6, Vercel's production deployment of `main` is staging: `APP_ENV=preview`, the free Supabase project (D-032), the brand domain and no indexing (D-047). Branch previews stay private behind Vercel Authentication. Production gets its own Supabase Pro project in London at launch.
- **Options:** A separate staging project and subdomain now.
- **Reason:** One hosted environment is enough while there are no real users, and it keeps the free plan's two-project limit free for production.

## D-050 | 2026-09-11 | Hosted auth settings live in config.toml
- **Decision:** The staging project's auth settings (site and redirect URLs, rate limits, email templates, the Resend sender, Twilio, two-step verification and Google) live in their own file, `ops/staging/supabase/config.toml`, applied with `supabase config diff --workdir ops/staging` then `config push`. Brand values come from `brand.ts` through `scripts/supabase.mjs`; secrets come from `.env.local`, and the push refuses to run while one is missing.
- **Options:** Set each one in the dashboard by hand, as the first version of the runbook described.
- **Reason:** The settings are then reviewed in a pull request, repeat identically for production, and cannot drift silently. A separate file rather than a `[remotes.staging]` block inside `supabase/config.toml`, because a remote block inherits everything the local one declares: the diff showed the nine local test phone numbers being added to the hosted project, where they would let anyone mark a number as verified. Only what the hosted file declares is pushed, so the local stack keeps its test numbers and staging never sees them. Staging also gets Supabase's own rate limits rather than the generous local ones, and no test phone numbers. The push is always preceded by a diff: the CLI warns that a non-interactive push answers its own prompts and can overwrite a hosted setting.

## D-051 | 2026-09-12 | Supabase security advisor warnings on staging are expected
- **Decision:** The six Security Advisor warnings on the staging project are accepted as they are, with no code change. Four name our own RPCs (`create_business`, `list_my_sessions`, `revoke_my_session`, `request_account_deletion`), which are `security definer` by design: they check the caller with `auth.uid()`, run in one transaction and write audit rows, and `execute` is granted to signed-in users only. The other two name `public.rls_auto_enable`, an event trigger function the platform creates, which enables row-level security on any new table in `public`.
- **Options:** Rewrite the RPCs as `security invoker` (they would then need direct table grants, which the brief forbids); revoke `execute` on the platform's function.
- **Reason:** The advisor flags the pattern, not a fault. `rls_auto_enable` returns `event_trigger`, so it cannot be called directly or through the API, and it only adds protection. Our own migrations enable row-level security on every table, and a pgTAP test fails the build if one lacks it. Checked on staging: zero tables without row-level security, and the sign-out guard (D-041) is active on the authenticator role.

## D-052 | 2026-09-12 | The local job runner is fetched when asked for, not installed
- **Decision:** `pnpm dev:jobs` runs the job runner through `pnpm dlx inngest-cli@1.44.0`. It is not a dependency of the workspace.
- **Options:** Add `inngest-cli` as a dev dependency, which needs its install script allowed.
- **Reason:** That package downloads a platform binary from the internet in its install script. As a dependency it would run on every install, including in CI, which neither needs the runner nor should pull binaries at install time (D-025). Fetching it on demand keeps the version pinned and the surface small. The `inngest` library itself is a normal pinned dependency; its transitive `protobufjs` install script is denied, since it only prints warnings.

## D-053 | 2026-09-12 | The shared database client type is structural
- **Decision:** `DbClient` in `packages/db` is `Pick<SupabaseClient<Database>, 'from' | 'rpc'>` rather than the class type.
- **Options:** Keep the class type and force one copy of the client library, for example by adding OpenTelemetry to every package that needs alignment.
- **Reason:** pnpm installs a second copy of the client library when a package brings a different set of its peer dependencies: adding the job runner did exactly that, and the two copies stopped being interchangeable because the class has protected members. Helpers in `packages/db` only need the query entry points, so a structural type accepts either copy and the problem cannot come back.

## D-054 | 2026-09-12 | Onboarding progress is two columns on the instructor profile
- **Decision:** `instructor_profiles` carries `onboarding_step` (1 to 5) and `onboarding_completed_at`. The step list, its order and which steps can be skipped live in TypeScript (`lib/onboarding/steps.ts`), not in the database. An instructor who has not finished is sent to `/onboarding` from anywhere in their portal, and one who has is sent away from it.
- **Options:** A separate `onboarding_progress` table with a row per step; or no stored progress at all, deciding each time from whether the profile fields are filled in.
- **Reason:** The five steps are fixed by the PRD (AUTH-04) and skipping is allowed on four of them, so a per-step table would store rows that say nothing. Deriving progress from the fields would be wrong the moment someone skips a step, because a skipped step and an unanswered one look identical. Two columns resume exactly where the person left off, survive a reload, and cost one join-free read on every portal request. Changing the steps later is a migration-free edit in one file, with the column's range check widened only if the count changes.

## D-055 | 2026-09-12 | Profile photos are re-encoded in the browser, and the bucket takes nothing else
- **Decision:** The browser crops a chosen picture to the middle square, scales it to 512 px and re-encodes it as WebP before uploading. The `avatars` bucket is public to read, accepts `image/webp` only, caps a file at 2MB, and each object lives in a folder named after the instructor profile that owns it, which is what the storage policy checks. The database column holds the object path, not a full address, so `photo_url` became `photo_path`.
- **Options:** Upload the original and process it on the server with `sharp`; or upload the original untouched and strip metadata when it is served.
- **Reason:** A photo taken on a phone carries the position it was taken at, which for a driving instructor is usually their home, and a profile picture is public. Re-encoding through a canvas drops every metadata block, so the original bytes never leave the device at all, which is the strongest version of that guarantee and costs no server time. Restricting the bucket to the one type the browser produces means a caller that skips the app cannot store an untouched original either. Orientation is read from the file before the metadata goes, so a picture taken in portrait is not stored on its side. Storing the path rather than the address keeps a restored or moved project working, and makes signed addresses possible later for the private badge bucket (M1-04).

## D-056 | 2026-09-12 | A badge number is checked for shape, not against the register
- **Decision:** `submit_verification` accepts 4 to 12 letters or digits, stores it in capitals, and sets the profile to `pending`. Nothing is checked against the DVSA register automatically; a person does that before the tick is granted (M1-12).
- **Options:** Require exactly six digits, which is what an ADI badge carries today; or call a DVSA service.
- **Reason:** There is no public service to check a badge number against, and scraping DVSA systems is forbidden by the brief. A format rule tight enough to match today's badges would turn away a real instructor whose badge is older, replaced or formatted differently, and the cost of that is losing them at sign-up. The shape rule catches typing mistakes, and the tick, which is what learners actually rely on, still comes from a person reading the photo.

## D-057 | 2026-09-12 | The postcode cache is added to, never changed
- **Decision:** `public.cache_postcode` is the only way into the `postcodes` table from the API. It is `security definer`, granted to signed-in people, checks the postcode shape and that the coordinates are inside the United Kingdom, and inserts with `on conflict do nothing`. Refreshing a row that is already there is a job for later, with the secret key.
- **Options:** Write the cache with the secret key from the Server Action; or grant `insert` on the table to `authenticated`.
- **Reason:** The lookup happens while a person is filling in a form, so the write has to happen in their request, and the brief keeps the secret key to webhooks, jobs and seeds. A direct grant would let anyone change the coordinates of a postcode other instructors already cover, which would quietly move their coverage. Insert-only means the worst anyone can do is be first with a plausible UK position for a postcode nobody has looked up yet, and a refresh job can correct it. The same shape and bounds rules live in TypeScript and in the function, because the function is reachable from the API whatever the app does.

## D-058 | 2026-09-12 | Without a map key, the coverage area is drawn rather than missing
- **Decision:** `mapSettings()` returns `static` when `NEXT_PUBLIC_MAPBOX_TOKEN` is empty, and the coverage step draws the circle itself: the radius, the postcode at the middle and two dashed rings for scale. With a token it loads Mapbox instead, through `next/dynamic` with `ssr: false`, in its own chunk. A test fails the build if any other module imports the map library.
- **Options:** Block the coverage step until a token is set, as the Google button is blocked on its client secret (M0-23); or ship the map library to every page.
- **Reason:** The step asks one question, how far an instructor travels, and a drawing answers it. Blocking would stop onboarding on a key that is only needed to make the answer prettier, and the product owner does not have that key yet. The library is around a megabyte, which is more than the rest of the page put together, so it is loaded only where a map is actually drawn. The Mapbox path itself is written but cannot be run here: it needs checking once against a real token, and that is listed in the milestone report.

## D-059 | 2026-09-12 | Onboarding asks for one pair of times across the days chosen
- **Decision:** The last onboarding step asks which days an instructor teaches and one start and finish time for all of them, and writes a `working_hours` row per day through `set_working_hours`, which replaces the week in one transaction. Different times per day belong to the full editor (M1-17).
- **Options:** A seven-row grid with a start and finish per day, which is what the diary editor will be.
- **Reason:** The milestone is judged on an instructor finishing onboarding in under five minutes on a phone, and seven rows of two time fields is the slowest screen in it. Most instructors do work the same hours on the days they work, and the ones who do not can say so in the editor a minute later. The database is not simplified by this: the rows written are exactly the rows the editor will edit, so nothing is migrated when the editor lands.

## D-060 | 2026-09-12 | Languages and specialisms are picked from a list, not typed
- **Decision:** The profile editor offers thirteen languages as chips (English, then the languages most spoken in the United Kingdom after it, plus British Sign Language) and the six specialisms the PRD names. The database column stays free text, so the list can grow without a migration.
- **Options:** A free text field, or a full ISO language list.
- **Reason:** Typed languages arrive as "english", "Eng", "English (fluent)" and cannot be searched on, which is what COV and marketplace filtering will need. A full list is 180 entries of noise on a phone. A short list covers almost everyone, is one tap, and an instructor who speaks something else is a support request that tells us what to add next. The column is unchanged, so nothing is migrated when it grows.

## D-061 | 2026-09-12 | R-18 is enforced on the booking row, and supervision is the school's to give
- **Decision:** A trigger on `bookings` refuses any booking for a trainee with no supervising school or instructor, raising `PDI_NOT_LINKED`. The link itself is set by `set_supervisor`, which only someone who can manage members of that Business may call, and the columns carry no update grant at all. A trainee naming a supervisor outside their own Business waits for the school features (M5).
- **Options:** Check the rule inside the booking RPCs when they are written in M2; or let a trainee name their own supervisor.
- **Reason:** The rule is the difference between a legal lesson and an illegal one, so it belongs where the row is written rather than in each of the several places that will write one. A trainee who could name their own supervisor could name anyone, which is the same as having no rule. Within one Business the answer is simple and complete: the school employing the trainee takes responsibility for them. Across two Businesses it is an agreement between them, which needs both sides to accept, and that is a school feature with its own screens.

## D-062 | 2026-09-12 | The school diary has no branch filter, because there are no branches
- **Decision:** The school diary filters by instructor and by transmission. DIA-09 also lists a branch filter; branches arrive with multi-branch schools, which the PRD itself puts in Phase 5 (SCH-08). The filter arrives with them.
- **Options:** Add a branch field to the schema now and leave it empty.
- **Reason:** A filter with one option, or none, is a control that does nothing and has to be explained. The data model has no branch and the roadmap says why. Nothing about the diary makes the filter harder to add later: it is one more condition on the same query.

## D-063 | 2026-09-12 | Diary updates are broadcast by the database, on a topic per instructor
- **Decision:** A trigger on `bookings` calls `realtime.send` on the private topic `diary:<instructor profile id>` with identifiers only. A policy on `realtime.messages` decides who may join a topic: the instructor themselves, or anyone who manages bookings for the Business they teach for. The page asks the server for itself again when a message arrives rather than patching anything from the message.
- **Options:** Subscribe clients to table changes on `bookings` directly (`postgres_changes`); or poll.
- **Reason:** Table changes send the whole row to every listener and rely on each client asking for the right filter, which is a lot of trust in the client and a lot of personal data on the wire for a message that only needs to say "something changed". A topic per instructor is the unit people actually watch, the payload is two identifiers, and who may listen is a policy in the database rather than a filter in a browser. Asking the server for the page again means one rendering path for the first load and every update after it.

## D-064 | 2026-09-12 | An invitation is a hashed one-use token, carried in a cookie rather than a URL
- **Decision:** `invite_learner` returns the token exactly once and stores only its SHA-256 hash, so the row cannot be turned back into a working link. A visitor who opens an invitation before they have an account has the token kept in an httpOnly cookie set by the proxy, and `completeSignIn` spends it once the account exists. The landing page shows a name and nothing else before sign-in.
- **Options:** Store the token itself and compare it directly; or carry it through sign-up in the query string, which is where the name and email prefill already travel.
- **Reason:** Invitations are the one link in the product that a stranger holds, so the table that lists them should not be a list of usable links. A token in a URL survives in history, in a screenshot and in anything the learner pastes to a friend, and that URL is the one thing we know they will be looking at on a phone; a cookie is read by the server that set it and by nothing else. The name and email in the query string are the learner's own details, already in the message the instructor sent them, and they are only defaults on a form. Setting the cookie in the proxy rather than the page is not a preference: a Server Component render may not write cookies.

## D-065 | 2026-09-12 | Four filters cover six statuses, so nobody is invisible
- **Decision:** The learner list offers the four filters LRN-01 names (Active, Waiting, Passed, Inactive) plus Everyone, and each covers the statuses that mean the same thing to someone looking for a person: Active is active and test booked, Waiting is enquiry and waiting, Passed is passed, Inactive is left. A unit test fails if a status is ever added without a filter that shows it.
- **Options:** One chip per status, which is six chips and a scrolling row on a phone; or the four filters as named, leaving enquiry and test booked reachable only under Everyone.
- **Reason:** LRN-01 asks for four filters and LRN-05 for six statuses, and the gap between them is where people get lost: an enquiry that no filter shows is a learner nobody calls back. Grouping keeps the row to five taps on a phone and still answers the two questions an instructor asks a list, who am I teaching and who am I waiting on. The status itself is on the row, so nothing is hidden by the grouping.

## D-066 | 2026-09-12 | The learner list is a view, not an RPC
- **Decision:** `learner_list` is a `security_invoker` view joining the relationship, the person, their learner profile and, through one lateral, the lessons either side of today. The app reads it with ordinary filters. Writes still go through RPCs.
- **Options:** An RPC returning the same rows; or the app joining four tables and counting bookings per learner.
- **Reason:** A view inherits the policies of the tables under it, so there is one set of rules to reason about and no `security definer` function deciding who may see a learner. Reads have always gone through RLS here and only writes through RPCs, and this is a read. The lateral means a list of forty learners is one query rather than forty, and the same view answers the learner card in M2-05 without a second shape of the same data.

## D-067 | 2026-09-12 | An undone deletion is counted by the page, not by the toast
- **Decision:** Deleting a note hides it at once, starts a five second timer, and shows a toast with Undo. The timer, not the toast, decides when the deletion happens, and a page that unmounts with a timer still running carries the deletion out immediately rather than dropping it.
- **Options:** Delete when the toast closes, which is what `toastWithUndo` offers; or delete straight away and let Undo write the note again.
- **Reason:** A toast stops counting down while the pointer rests on it, and the pointer rests on it often, because it appears under the cursor that just pressed delete. A deletion that waits for the mouse to move is not a deletion. Writing the note again on Undo would be reliable too, but the note would come back dated today, and a note written three weeks ago should not change its date because somebody pressed the wrong row. What is left is a closed tab within the five seconds, where the note simply stays: the safe way for a deletion to fail.

## D-068 | 2026-09-12 | A learner added by hand gets an account they can claim later
- **Decision:** Adding a learner manually, or by CSV, creates an unconfirmed Supabase Auth account for them and links it to the Business. The account has no password and is not confirmed, so the real person claims it by signing up with the same email or number, which keeps the lessons and the Passport already recorded against them. Creating that identity is the one place the secret key acts for a signed-in person: it is wrapped in a module that can only create or delete an identity, it never touches a tenant table, and it runs only after the caller has been checked. If the link that follows fails, the account is deleted again. Details that already belong to an account are refused with "send them a link instead", so nobody is attached to an existing account without accepting it.
- **Options:** Keep unclaimed learners in their own table with a nullable `learner_id` on the relationship, which means bookings, credit and the Passport all have to handle a learner who is not a user; or insert into `auth.users` from SQL, which hand-rolls the internals of a system we do not own; or refuse to add anybody who has not signed up, which makes importing a book of business impossible.
- **Reason:** The PRD is explicit that a learner is a global user (6.1), and every table downstream of that assumption, bookings included, is built on it. An unclaimed account keeps that one model: an imported learner can be booked, paid for and taught from the day they are imported, and the day they sign up they inherit all of it rather than starting again. The rule about the secret key exists so that nobody's data is read or written behind their session, and that rule is untouched here: the key creates an identity, and everything about the learner goes through the instructor's own session and the policies.

## D-069 | 2026-09-13 | A slot chosen before signing up is remembered, not held
- **Decision:** Somebody who picks a time on a booking link before they have an account has that choice kept in an httpOnly cookie while they sign up, and comes back to the link with it already selected. Nothing is booked on their behalf: they press the button themselves. The slot is not reserved while they are away.
- **Options:** Book it for them the moment their account exists; or hold the slot for the few minutes it takes them to sign up.
- **Reason:** Booking somebody into a lesson they have not confirmed since making an account is a lesson they did not agree to, and the sign-up can take minutes if the email is slow. Holding the slot needs a hold that expires, which is the machinery M3 brings with payment holds, and holding it without that machinery means a stranger can freeze an instructor's diary by starting a sign-up. Remembering the choice costs nothing, survives the email, and puts the decision back in front of the person who made it.

## D-070 | 2026-09-13 | Tests find the seed rather than remember it
- **Decision:** End to end tests that need a seeded lesson look one up in the database rather than writing a date into the test, and the booking tests each work on a day of their own, cleared before they start.
- **Options:** Keep fixed dates and reseed to a fixed "today".
- **Reason:** The seed is anchored to the day it runs, so a date written into a test is right until midnight. Two tests failed on exactly that the first time the clock rolled over mid-milestone. A test that finds what it needs keeps working whatever day it runs on, and a day per test keeps the suite parallel: they all book into one seeded instructor's diary.

## D-071 | 2026-09-13 | A cancelled lesson is struck through, not faded
- **Decision:** A lesson that has been called off is shown with its name muted and struck through and its Cancelled pill beside it, rather than by fading the whole row to sixty per cent.
- **Options:** Keep the fade and exempt the row from the accessibility check; or fade only the parts that are not text.
- **Reason:** An axe run over a week with a cancelled lesson in it failed on contrast: grey-700 text at sixty per cent opacity over white is below AA, and it is text somebody is trying to read to find out what happened to their lesson. The strike-through and the pill already say the lesson is off, and they say it to a screen reader too, which the fade never did. D-009 rules out low-contrast text everywhere else; this closes the last place it was still being produced.

## D-072 | 2026-09-13 | Which channels a notification uses is decided when it is written
- **Decision:** The job that reacts to an event applies the catalogue and the person's settings there and then, and stores the channels on the notification row. The jobs that send email, push and text messages read that list rather than working the rule out again. The row is written by `system_notify`, which is idempotent on a key of kind, thing, version and person.
- **Options:** Decide at send time, which is what the architecture sketch assumed: write the notification, then let each channel's job ask the preferences again.
- **Reason:** Deciding twice means two places to keep in step, and they drift the moment somebody changes a setting between the write and the send: a person who switched email off at ten past would still get the ten o'clock email, or worse, would not get the one they were promised. Deciding once also makes the rule testable without a database, which is where it now lives: `channelsFor` in packages/core, with the rule that a service message always keeps the inbox. What is lost is the ability to change a channel after the event and have it apply retroactively, which nobody wants anyway.

## D-073 | 2026-09-13 | The Serwist spike passed, and the worker precaches nothing yet
- **Decision:** Keep `@serwist/turbopack` (D-013). The worker is written in `src/app/sw.ts`, compiled by a route at `/serwist/[path]` and served from `/sw.js` through a rewrite, so its scope is the whole app. It is registered only when somebody turns push on, and it precaches nothing: `globPatterns: []`. What to keep offline is decided in M4, where the offline lesson record lives.
- **Options:** Fall back to `@serwist/next` with a webpack production build, as D-013 allowed; or hand-write a worker and drop Serwist until the offline work.
- **Reason:** The spike found no blocker: it builds with Turbopack and with `cacheComponents: true`, in development and in a production build. Two things are worth writing down. The route is dynamic rather than prerendered, because `cacheComponents` ignores its `force-static` export, so the worker is compiled on the first request an instance serves and cached in memory after that; two browsers asking a cold instance at the same moment can race, which is why the end to end test warms it first. And the default precache was 78 files, four and a half megabytes: that is a fair trade for an app somebody chose to install, and no trade at all for somebody who only turned on notifications, so it waits for the milestone that decides it.

## D-074 | 2026-09-13 | A push tells the open app before it shows a banner
- **Decision:** The service worker's push handler posts the notification to any open tab first, then shows the system notification.
- **Options:** Show the notification only, and let the page find out when it is next loaded.
- **Reason:** Somebody looking at the app when a lesson is cancelled should see it there, not only in a banner over the top of it. It also makes the handler testable: the browser Playwright drives has no notification UI at all, so a test can prove the push arrived and was acted on, which a banner it cannot render never could.

## D-075 | 2026-09-13 | Reminders are swept for, not slept on
- **Decision:** A job every five minutes asks which lessons are close, and packages/core decides which reminders have come due for each of them. Each reminder carries the lesson's version in its key, so a lesson that moved is reminded about at its new time and never at its old one.
- **Options:** The architecture sketch's shape: a function triggered when a lesson is confirmed that sleeps until each reminder is due, cancelled and restarted whenever the lesson changes.
- **Reason:** A sleep of twenty-four hours is a promise the job runner has to keep across deploys, restarts and any change to the lesson in between, and cancelling one reliably means tracking every event that could invalidate it. A sweep holds no state at all: it looks at the lesson as it is now. The cost is that a reminder can be up to five minutes late, which nobody notices, and one query every five minutes, which is nothing. The dedupe key does the rest of the work: a reminder already written is never written twice, and a lesson at a new version is a new reminder.

## D-076 | 2026-09-13 | The name is Doovor, on doovor.com
- **Decision:** The product is called Doovor and lives at `doovor.com` (product owner, 13 September 2026). This supersedes the temporary domain in D-026. `packages/config/src/brand.ts` still holds the name and the domain and nothing else does: two lines change the wordmark, every URL, every sender, the support address, the text message sender and the hosted auth settings, and the copy guard then fails the build if either value is written anywhere else.
- **Options:** Spell it in capitals, DOOVOR, as the owner wrote it.
- **Reason:** Sentence case is what the name looks like inside a sentence, which is where most of it appears: "your Doovor account", "Doovor Driving". A wordmark that wants capitals can have them in CSS without changing the word. One line changes it if they would rather it were DOOVOR everywhere.

## D-077 | 2026-09-13 | A refund is made in the app, never in the Stripe dashboard
- **Decision:** Connected accounts get the Express Dashboard with "View payments", "Edit payout schedule" and reports turned on, and with "Issue refunds" and "Manage disputes" turned off. Refunding is done in Doovor (M3-17), which calls Stripe and writes the refund, the booking and the credit ledger in one go.
- **Options:** Turn refunds on in the Express Dashboard as well, so an instructor can give money back from either place.
- **Reason:** A refund made in Stripe never reaches `payments`, the booking's payment status or a learner's credit balance, so the two records disagree the moment anybody uses it: the learner is told they still have a lesson paid for, the instructor's takings are wrong, and the cancellation rules in PAY-08 are applied to a payment that is no longer there. The `charge.refunded` webhook could reconcile it afterwards, but that is a second way to do the same thing and it cannot know which credit entry the money belonged to. Seeing payments and choosing a payout day change nothing we hold, so those stay on: the PRD gives the owner payouts and billing (section 6), and Stripe is where bank details live.

## D-078 | 2026-09-13 | A learner is never charged extra for paying by card
- **Decision:** The card fee is the Business's cost, taken out of its own balance by Stripe, and never added to what the learner pays. The lesson price a learner sees is the lesson price they pay. Doovor's own money comes from subscriptions, and in Phase 3 from a marketplace booking fee that applies to a first booking however it is paid (PRD 18.1, 18.2).
- **Options:** Add the card fee to the learner's total at checkout; or show a lower price and add the fee at the end.
- **Reason:** It is not lawful. The Consumer Rights (Payment Surcharges) Regulations 2012, as amended by the Payment Services Regulations 2017, stop a trader charging a consumer anything extra for paying by card, and that covers debit, credit and the wallets built on them. A fee charged to everybody whatever they pay with is a different thing and is allowed, which is why the Phase 3 booking fee is written that way. It is also the better trade even where it is allowed: about 1.5 per cent and 20p on a forty pound lesson is around eighty pence, against a no show that costs the whole hour, so an instructor taking payment at booking is ahead on the first lesson they do not lose. The honest answer to an instructor who objects to the fee is that they price it in, the way every other business does, and that cash and bank transfer stay first class and free to record (PAY-05). Not legal advice: PRD section 20 still wants a solicitor over the payment terms before launch.

## D-079 | 2026-09-13 | Keeping a card is a box the learner ticks
- **Decision:** When a learner types a card in to pay for a lesson, an unticked "Save this card for next time" box sits above the pay button, and says which Business keeps it and where to remove it. The card is kept only if they tick it. A learner who has kept a card with that Business sees it offered first next time: "Pay £42 with Visa ending 4242", with "Use a different card" beside it. Every card can be removed from Payments, with five seconds to undo.
- **Options:** Keep every card that pays, which M3-05 did; or a box that starts ticked.
- **Reason:** Keeping a card to charge later needs the cardholder's agreement under the card schemes' stored credential rules, and a box somebody did not tick is not agreement: the ICO says the same of pre-ticked boxes generally. It is also the better trade on trust, which is the thing a learner is weighing the first time they give a small business their card. What it costs is some second lessons that need a card typed in again, and the offer in the box ("your next lesson takes one press") is what wins those back. Pay before lesson (M3-09) is different: a Business that charges the day before has to keep the card, so that mode will say so plainly instead of asking.

## D-080 | 2026-09-13 | Saved cards are read from the provider, never copied
- **Decision:** Nothing about a saved card is stored in our database. `billing_customers` says which customer on a Business's account is which learner; the cards are listed from the provider each time they are shown, and removed there. Cards that have run out are not offered. Removing a card removes every copy of it that customer has, found by the card's fingerprint, and the provider refuses to remove a card that is not on the customer asking.
- **Options:** Mirror brand, last four and expiry in a `saved_cards` table, kept in step by `payment_method.attached` and `payment_method.detached` webhooks.
- **Reason:** A copy is a second place a card can be wrong: removed in Stripe and still offered here, or charged here after the learner removed it. The only thing a copy buys is speed, and the list is shown on two screens a learner opens a few times a month. Keeping card data out of the database also keeps it out of every backup, export and support query. Paying the same card twice through the form saves it twice in Stripe, which is why the list collapses copies by fingerprint and removal takes all of them: a card that comes back after it was removed is a card somebody thinks we kept.

## D-081 | 2026-09-13 | A request is sent before the card is authorised, not after
- **Decision:** At a Business that takes cards, a learner's request reaches the instructor the moment it is made, and the learner is then asked to authorise their card for it. The authorisation is taken when the instructor accepts and let go when they decline, when the request runs out, or when it is cancelled. A request accepted before the learner authorised anything becomes an ordinary lesson that is owed for, and the learner is asked to pay for it the usual way. The taking and the letting go are one sweep, every five minutes and at once whenever an answer or an authorisation arrives, one run at a time.
- **Options:** Hold the request back from the instructor until the card is authorised, so an instructor only ever sees requests that are paid for in principle.
- **Reason:** Holding it back makes the request depend on the payment form, and a learner who closes the tab at the card form has asked for nothing, silently. The instructor loses a lesson they would have taken and the learner never finds out why. Sending it first means the worst case is a lesson somebody accepted and is owed for, which the app already handles for every other unpaid lesson (PAY-06). The sweep follows D-075: it looks at what the lessons and payments are now, so an authorisation that lands after the answer, or a job that died half way, is settled on the next run without anything to cancel or replay.

## D-082 | 2026-09-13 | A payment failed notice is for a charge nobody was there to see
- **Decision:** The "payment did not go through" notification (Appendix B) goes to the learner, the instructor and the school when a lesson paid for the day before cannot be charged: no card saved, the card has run out, it was refused, or the bank wants the card holder to confirm. The learner's notice takes them straight to the lesson's pay screen. A card refused while the learner is on the pay screen sends nothing, because the screen has already said so. The charge job never retries a failure on its own; the learner pays, on screen, where their bank can ask them anything it needs to.
- **Options:** Notify on every failed payment event from the provider, which is what the outbox already records; or retry a refused charge a few times before telling anybody.
- **Reason:** A learner mistyping a card number at checkout would otherwise email their instructor about it, several times, while still sitting at the form. The case the PRD cares about is money that was expected and did not arrive, which only happens with nobody there. Retrying a refused card with nobody there mostly produces more refusals and, for a card that needs its holder to confirm, cannot ever work; telling both people once, a day before the lesson, leaves time to sort it out. A failure is written down in the same statement that stops the lesson being due, so a run that repeats cannot tell anybody twice.

## D-083 | 2026-09-13 | The payment link after a lesson is the learner's own pay screen
- **Decision:** When a lesson booked to be paid afterwards is marked done, the learner gets a "Pay for your lesson" notice, in the inbox, by push and by email, whose link is that lesson's pay screen in the app. It is a new catalogue kind, `payment.requested`, learner only, and a service message, so it arrives whatever they have switched off. A finished lesson still owed for also shows a Pay button in the learner's history. Opening the link signed out asks them to sign in first, and comes back to the same screen.
- **Options:** A link that pays without signing in, carrying a single-use token for the lesson, as a hosted invoice page would.
- **Reason:** Every learner who can be booked has an account, and signing in by emailed link is one tap. A token that pays without an account is a secret sitting in an inbox that can be forwarded, logged by a mail scanner, or opened by whoever shares the family laptop, and it would need its own expiry, revocation and rate limiting to be safe. The signed-in screen already does everything the payment needs, including saved cards and the webhook path, so a second way in would be a second thing to get right for no gain in Phase 1. Appendix B has no row for this notice because it describes the payment link as part of the flow (PRD 10.2), not as a notification; this entry is the row.

## D-084 | 2026-09-13 | The app is app.doovor.com, and doovor.com is the public site
- **Decision:** Everything somebody signs in to, the portals, pay screens, booking links and every link in an email or text, lives on `app.doovor.com` (product owner, 13 September 2026). `doovor.com` is the public site: today's placeholder home page, and the landing, pricing and blog pages when they arrive. An app address opened on `doovor.com` moves to the same path on `app.doovor.com` for good, so no link ever breaks; the app's bare root goes to getting started, which sends somebody already signed in to their portal. Email still comes from `@doovor.com`: the sender is the brand, not the host. `brand.ts` holds both, `productionUrl` for the site and `appUrl` for the app, and hosted auth, Apple Pay and email links all follow `appUrl`.
- **Options:** One host for everything on `doovor.com`; or the app on the bare domain and the public site on `www`.
- **Reason:** A marketing site is rebuilt far more often than the product and usually with different tools, and on its own host it can be, without the app's deploys, cookies or security headers coming into it. It keeps sign-in cookies off the public site entirely. The cost is two hosts to configure and the need to decide where public pages meant to be found by search belong: booking links stay on the app for Phase 1, where they are shared rather than searched for, and public instructor profiles should live on `doovor.com` when the marketplace opens (Phase 3).
