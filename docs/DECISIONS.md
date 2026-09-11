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

## D-005 | 2026-09-11 | Neutral package scope and generated brand tokens
- **Decision:** Workspace packages use `@repo/*`. Tailwind tokens are generated from `brand.ts` at build time into a git-ignored file. A CI copy guard scans for the brand name and dashes.
- **Options:** Brand-named scope (`@drivinghub/*`); hand-written token CSS.
- **Reason:** The brief requires a rename to be a one-file change. A brand-named scope or duplicated hex values would break that.

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
