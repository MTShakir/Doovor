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

## D-011 | 2026-09-11 | Stripe direct charges on connected accounts | Confirm (PRD open decision)
- **Decision:** Build on direct charges with Express accounts behind `PaymentsProvider`.
- **Options:** Direct charges (Business is merchant of record); destination charges (platform is merchant of record).
- **Reason:** Matches the PRD: money goes to the Business, card fees pass through, no platform wallet (PAY-12), receipts carry the Business name. PRD section 20 needs solicitor and Stripe sign-off before M3 goes live.

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
