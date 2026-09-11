# Delivery plan: Phase 1 (M0 to M6)

Status: Draft for approval | 11 September 2026

Every task is half a day or less and traces to PRD IDs. Tasks run roughly in order within a milestone. Each milestone ends with its Definition of Done and a report, then waits for "Approved, continue". Phase 2 work does not start without approval.

**Every task's done bar:** tests written first where logic matters, `pnpm check` green, UI checked with Playwright at 390 px and 1440 px where relevant, one conventional commit naming the PRD ID, `docs/PROGRESS.md` updated.

**Milestone Definition of Done (all milestones):** all tests green with none skipped, no TypeScript or lint errors, Playwright flows passing at mobile and desktop widths, screenshots reviewed, PROGRESS.md updated, report delivered (what was built with PRD IDs, how to test, screenshots, test results, known gaps, decisions logged).

Branches: `m0-foundation`, `m1-instructor-core`, `m2-learners-bookings`, `m3-payments`, `m4-progress-offline`, `m5-public-schools-admin`, `m6-hardening`.

## Acceptance test map (PRD 17.2)

| # | Test | Automated in | Layers |
|---|---|---|---|
| 1 | Buffer: 11:15 rejected "Too close to your 10:00 lesson", 11:30 succeeds | M2 | pgTAP, Playwright |
| 2 | Two learners, same slot, same moment: exactly one succeeds | M2 | pgTAP concurrency, integration |
| 3 | Credit 120, book 60, cancel 72 h before, back to 120 | M3 | pgTAP, integration, Playwright |
| 4 | Late learner cancellation keeps full fee and emails why | M3 | Integration (Stripe test mode), Playwright |
| 5 | Instructor cancels a paid lesson, full automatic refund | M3 | Integration (Stripe test mode) |
| 6 | Same webhook delivered 3 times, one payment and one credit entry | M3 | Integration (Stripe CLI replay) |
| 7 | Business A requests Business B's learner by ID, gets not found | M0 (RLS), M5 (API level) | pgTAP, integration |
| 8 | Lesson record saved in airplane mode appears after reconnecting | M4 | Playwright offline |
| 9 | Clocks go forward, weekly 09:00 lesson stays 09:00 London | M2 | Vitest, pgTAP |
| 10 | Expired badge: gone from search, profile says "Not taking new bookings" | M5 | Integration, Playwright |
| 11 | School manager cannot see payouts or billing | M5 (RLS groundwork in M0) | pgTAP, Playwright |
| 12 | Learner self-books from a shared link on a phone in under 60 s | M2 (pay later), re-run in M3 (card) | Playwright at 390 px |

## External prerequisites by milestone

| Needed by | Item | Owner |
|---|---|---|
| M0 start | Docker Desktop (WSL 2) and Node 24 LTS on this machine | Product owner |
| M0 end | GitHub repository, Vercel project, Supabase staging project (London), Google OAuth client, Apple Sign in keys, Twilio for hosted phone OTP | Product owner |
| M1 | Mapbox access token | Product owner |
| M2 | Resend with a verified sending domain, Inngest account | Product owner |
| M3 | Stripe platform account with Connect enabled, charge model sign-off | Product owner and solicitor |
| M6 | Sentry (EU), PostHog (EU), uptime monitor, solicitor-approved legal text (placeholders until then) | Product owner |

Until an item arrives, work continues with provider fakes and local config. Nothing waits on a key that isn't needed yet.

## M0 Foundation

Goal: monorepo, CI, design system, auth with every sign-in method, tenancy with RLS, audit log, seed data.

| ID | Task | PRD | Done when |
|---|---|---|---|
| M0-01 | Bootstrap repo: pnpm 12 workspace, Turborepo, Node 24 pin, root scripts, `.gitignore`, `.editorconfig` | 8.1 | `pnpm install` and `pnpm check` run on an empty workspace |
| M0-02 | Shared tooling: strict tsconfig bases, ESLint 10 flat config with package boundary rules, Prettier | NFR-SEC-03 | Lint fails on a forbidden import (for example React in core) |
| M0-03 | Copy guards: brand-name scan and em/en dash scan in CI | Rules 8, 9 | A planted violation fails `pnpm lint` |
| M0-04 | `packages/config`: `brand.ts`, feature flags, plan entitlements with Founding offer | 9.18, 4.1 | Unit tests for entitlement lookups |
| M0-05 | `.env.example` with every variable grouped and commented; typed env loader that fails fast on missing server secrets | NFR-SEC-02 | Missing secret fails at boot with a clear message |
| M0-06 | `packages/core` base: Vitest 5 with 90% coverage gate, money helpers (`formatPence`), error codes | 7.6 | `£42`, `£42.50` formatting tests pass |
| M0-07 | Core time helpers: UTC and London conversion, "Tue 15 Sep", "14:30", clock-change utilities | R-14 | Tests cover both 2026 and 2027 clock changes |
| M0-08 | `apps/web` skeleton: Next 16, route groups, `proxy.ts`, security headers, Inter, `/api/health` | 8.1, 8.3 | App builds, health returns 200 |
| M0-09 | Token pipeline: generate Tailwind theme from `brand.ts`; automated contrast test for every token pair used | 7.2, 14.4 | Contrast test encodes D-009 rules |
| M0-10 | UI set 1: Button (primary, secondary, tertiary), Input, Select, Checkbox, Switch, OTP input, form field with errors | 7.4 | Components render all states, 48 px targets |
| M0-11 | UI set 2: Card, List row with chevron, Avatar with Verified tick, Status pill, Chip, Skeleton, Empty state | 7.4 | Status pills match PRD 7.4 |
| M0-12 | UI set 3: Toast with 5 s undo, Stepper, Progress bar, Slider, Progress ring, Skill bar, Rating stars | 7.4, 7.1 | Undo works in a unit test |
| M0-13 | UI set 4: responsive Bottom sheet (mobile) / Side panel (desktop), Dialog, Tabs | 7.1, 7.4 | Reduced motion respected |
| M0-14 | Portal shells: bottom tab bars and desktop sidebars for learner, instructor and school; admin desktop shell | 8.2 | Nav matches PRD 8.2 at both widths |
| M0-15 | `/design` page with every component and state; Playwright screenshots and axe at 390 and 1440 px | 7.4 | Zero serious axe issues |
| M0-16 | Supabase local project: `config.toml` (providers from env, test OTP, TOTP, auth rate limits), extensions (`btree_gist`, `postgis`, `pgtap`), `private` schema, `updated_at` trigger, pgTAP runner | 13 | `pnpm db:reset` and `pnpm db:test` run |
| M0-17 | Migration: `users` (auth trigger), `platform_staff`, `businesses`, `memberships`, `invitations` | 6.1, 12 | pgTAP: profile row created on sign-up |
| M0-18 | Migration: RLS helpers (`auth_business_ids`, `auth_is_member`, `auth_has_role`, `auth_has_permission`, `auth_is_staff`) and policies for tenancy tables | 6.2, NFR-SEC-01 | pgTAP proves cross-tenant read and write fail |
| M0-19 | Migration: `audit_log` (append-only), sign-in trigger on `auth.sessions`, role-change trigger | NFR-SEC-06, ADM-07 | pgTAP: update or delete on audit rows fails |
| M0-20 | Migration: core Phase 1 schema for instructors, learners, relationships, notes, working hours, exceptions, lesson types, prices, packages, bookings (ranges trigger and both exclusion constraints) with RLS | 12, R-01 to R-03 | pgTAP: overlap rejected at the database; RLS meta-test passes for every table |
| M0-21 | Generated types, `packages/db` typed helpers, Supabase clients (server, browser, proxy) with `getClaims`, active Business cookie | 6.1 | Typecheck passes against generated types |
| M0-22 | Auth UI: sign up and sign in with email and password, magic link, callback, email verification | AUTH-01 | Playwright signs up and in locally |
| M0-23 | Google and Apple sign-in, buttons shown only when configured | AUTH-01 | Works locally once keys exist; hidden otherwise |
| M0-24 | Phone capture and SMS code verification for instructors (test OTP locally) | AUTH-02 | Playwright verifies a phone with the test code |
| M0-25 | Role choice screen `/start` and bootstrap RPCs (independent Business, school Business, learner profile) | AUTH-03 | Each choice lands in the right onboarding entry |
| M0-26 | TOTP enrolment and challenge; enforced for staff and school owners in `proxy.ts` and RLS (`aal2`) | AUTH-08 | Staff without `aal2` get no admin rows (pgTAP) |
| M0-27 | Account security page: devices, sign out one or all, account deletion request | AUTH-09 | Global sign-out invalidates other sessions |
| M0-28 | Seed part 1: verify real public-place postcodes via postcodes.io into a committed fixture; users for every role | 12 | Seed is deterministic and refuses to run against production |
| M0-29 | Seed part 2: Leeds independent (manual), Manchester school with 3 instructors (mixed transmission, one PDI), 8 learners, lesson types, packages, 14 days of availability and bookings | 12 | Seeded bookings satisfy the exclusion constraints |
| M0-30 | Role landing: each seeded role signs in and lands on the right portal; Playwright spec per role | AUTH-03 | Specs green at both widths |
| M0-31 | CI: lint, typecheck, unit, db, integration and e2e jobs; artefacts for screenshots | 14.5 | Pull request shows all checks green |
| M0-32 | Vercel project, preview deploys, staging Supabase wiring (needs accounts) | 8.1 | Preview URL loads and signs in |
| M0-33 | Milestone report | | Report delivered |

M0 Definition of Done: sign in as every seeded role and land on the right portal; RLS tests prove cross-tenant reads and writes fail; `/design` shows every component and state.

## M1 Instructor core

Goal: an instructor finishes onboarding in under 5 minutes and has a working diary.

| ID | Task | PRD | Done when |
|---|---|---|---|
| M1-01 | Inngest setup: client, `/api/inngest`, local dev server, `outbox_events` and dispatcher | 14.5 | An outbox event reaches a test function |
| M1-02 | Onboarding shell: 5 steps, progress bar, skip on all but name, resume where left | AUTH-04 | State survives reload |
| M1-03 | Step 1 name and photo: avatar upload to public bucket, resize and EXIF strip in browser | AUTH-04, INS-01 | Uploaded image has no GPS data |
| M1-04 | Step 2 ADI or PDI number and badge photo: private `badges` bucket, storage policies, verification submission | AUTH-04, INS-02 | pgTAP: another tenant cannot read the badge object |
| M1-05 | `GeoProvider` (postcodes.io) with `postcodes` cache; core normalisation and outcode parsing | COV-03 | Invalid postcodes rejected with clear copy |
| M1-06 | `MapProvider` (Mapbox) with monochrome style and radius circle component | COV-01 | Map lazy-loads, not in the public bundle |
| M1-07 | Step 3 base postcode and radius slider (1 to 30, default 8) | COV-01, AUTH-04 | Circle updates as the slider moves |
| M1-08 | Step 4 prices: hourly price and optional 10-hour package | AUTH-04, R-05, PAY-04 | Lesson type, price and package rows created |
| M1-09 | Step 5 weekly hours grid | AUTH-04, DIA-01 | Hours saved in local time |
| M1-10 | Today screen with checklist card (add first learner, connect payments, share booking link) | 10.1 | Checklist reflects real state |
| M1-11 | Profile editor for all INS-01 fields (bio 300 chars, languages, years, car, transmission, dual controls, specialisms) | INS-01 | Zod schema shared by form and server |
| M1-12 | Admin verification queue: list, badge via signed URL, approve or reject with reason, audit row, Verified tick | INS-02, ADM-03 | pgTAP: only staff can decide |
| M1-13 | Badge expiry rules in core and daily job (60, 30, 7 days), deduplicated; expired badge unlists | INS-03 | Job test with a fake clock |
| M1-14 | PDI: "Trainee instructor" label, supervisor link to a school or ADI, R-18 guard for bookings | INS-04, R-18 | Unlinked PDI cannot take bookings (pgTAP) |
| M1-15 | Coverage editor: include and exclude postcode districts | COV-02 | Invalid districts rejected |
| M1-16 | Pickup points model and picker (home, school, work, custom) | COV-04 | Stored per learner with location |
| M1-17 | Working hours editor and exceptions (open slots, time off with reason) | DIA-01, DIA-02 | Overlapping exceptions handled |
| M1-18 | Booking rules settings: buffer (0 to 60, default 30), notice, horizon, instant or request, request expiry | DIA-05, DIA-06, BOK-06 | Ranges from PRD 11.1 enforced |
| M1-19 | Diary day view (mobile default) with paid, unpaid, credit and test-day colours | DIA-03, DIA-04 | Screenshot review at 390 px |
| M1-20 | Diary week view (desktop default) | DIA-03 | Screenshot review at 1440 px |
| M1-21 | Diary month view | DIA-03 | Navigates to the day view |
| M1-22 | School diary: instructors side by side, filters for instructor, transmission and branch | DIA-09 | Manager sees all school instructors |
| M1-23 | Realtime diary invalidation over private channels | DIA-03 | A change in one tab shows in another |
| M1-24 | Playwright: new instructor completes onboarding in under 5 minutes at 390 px; milestone report | AUTH-04 | Timed run passes |

M1 Definition of Done: a new instructor completes onboarding in under 5 minutes in a Playwright run on a 390 px viewport.

## M2 Learners and bookings

Goal: learners join by invite, instructors and learners book, and the database makes double booking impossible.

| ID | Task | PRD | Done when |
|---|---|---|---|
| M2-01 | Learner onboarding: name, postcode, transmission, experience level, date of birth (16 or over) in `learner_private` | AUTH-06, R-16 | Under-16 rejected; instructors see age band only (pgTAP) |
| M2-02 | Rate limiter: `private.rate_limit_hit` and `RateLimiter` interface | NFR-SEC-03 | Integration test hits the limit |
| M2-03 | Invitations: hashed tokens, share by WhatsApp, SMS or email, pre-filled sign-up linked to the instructor, accept RPC | AUTH-07 | Invite link lands on sign-up with the instructor's name |
| M2-04 | CRM list: search, filters (active, waiting, passed, inactive), quick actions (call, message, book) | LRN-01 | Filters work at both widths |
| M2-05 | Learner card: contact, pickup points, transmission, lessons taken, hours, balance, next lesson, notes | LRN-02 | Card loads in one query |
| M2-06 | Private notes with tests proving no learner path can read them (tables, views, RPCs) | LRN-04 | pgTAP and integration tests green |
| M2-07 | Learner status workflow: Enquiry, Waiting, Active, Test booked, Passed, Left | LRN-05 | Transitions logged |
| M2-08 | Add learner manually | LRN-03 | Duplicate contact detected |
| M2-09 | CSV import: upload, column mapping, preview, validation report, dedupe (name, phone, email, postcode) | LRN-03 | 120-row file imports with a clear error report |
| M2-10 | School assign and reassign learner, history kept | LRN-06 | History visible on the learner card |
| M2-11 | Availability engine part 1: working hours and exceptions to local windows, clock changes | R-04, R-14 | Unit tests incl. March and October changes |
| M2-12 | Availability engine part 2: busy ranges, buffer, notice, horizon, step, instructor vs self rules | R-01, R-04, DIA-05, DIA-06 | Unit tests green, coverage above 90% |
| M2-13 | Shared availability test vectors (JSON) run by Vitest and by pgTAP against the SQL checks | R-04 | Both runners pass the same vectors |
| M2-14 | `create_booking` RPC: permission checks, pricing from DB, stale-request expiry, pre-check codes, constraint mapping | BOK-01, BOK-07, R-10 | pgTAP: acceptance-01 at database level |
| M2-15 | Concurrency test: parallel inserts for one slot, exactly one succeeds | BOK-07, R-02 | acceptance-02 green |
| M2-16 | Instructor 3-tap booking sheet: learner, slot, confirm; warning outside availability | BOK-01, BOK-03, BOK-04, R-04 | Playwright books in 3 taps |
| M2-17 | Self-booking at `/book/{slug}`: lesson type, slot, confirm (pay later until M3) | BOK-02 | Playwright at 390 px |
| M2-18 | Request to book: requested status, accept or decline RPC, expiry job and sweep | BOK-06, R-12 | Expired request frees the slot |
| M2-19 | Recurring bookings RPC: per-occurrence results, accept the rest | BOK-05, R-13 | Clashing dates listed |
| M2-20 | Recurring UI and open-ended extension job | BOK-05 | acceptance-09 green |
| M2-21 | Cancellation policy in core (window, fee, actor, no-show) | R-06 to R-09 | Unit tests for every row of the policy table |
| M2-22 | `cancel_booking` RPC with reason; records late flag and fee (money effects land in M3) | BOK-09 | pgTAP: reason required for instructor cancel |
| M2-23 | `reschedule_booking` RPC (learner outside window, instructor any time) | BOK-08 | Learner inside window blocked |
| M2-24 | Drag to move (desktop) and long-press (mobile) in the diary | DIA-03, BOK-08 | Optimistic move with rollback on clash |
| M2-25 | Complete, no-show (15 minutes after start) and cancel actions; complete opens the lesson record entry point | BOK-10, R-09 | No-show before 15 minutes blocked |
| M2-26 | Learner Lessons tab: upcoming and past, reschedule and cancel sheets | BOK-08, BOK-09, 8.2 | Screenshot review |
| M2-27 | Notification core: catalogue, `notifications`, preferences UI, dispatch job | NTF-01, NTF-03, NTF-04 | Dedupe key prevents double sends |
| M2-28 | Email: Resend provider and React Email templates for booking events | NTF-03 | Templates contain no em or en dashes (test) |
| M2-29 | Service worker spike (Serwist with Turbopack) and web push: VAPID, subscribe, push handler | NTF-01 | Push received in a Playwright browser |
| M2-30 | Reminders at 24 h and 2 h (configurable); SMS on Pro via Twilio with the 200 a month cap | NTF-02, NTF-01 | Rescheduled booking gets reminders at the new time only |
| M2-31 | Playwright: acceptance-01, 02, 09, 12; milestone report | 17.2 | All four green at both widths |

M2 Definition of Done: PRD acceptance tests 1, 2, 9 and 12 pass as automated tests.

## M3 Payments

Goal: money moves correctly through Stripe, credit and offline records, and every rule in R-06 to R-11 holds.

| ID | Task | PRD | Done when |
|---|---|---|---|
| M3-01 | `PaymentsProvider` interface, Stripe implementation, in-memory fake | 13 | Contract tests pass for both |
| M3-02 | Connect Express onboarding: account link, return and refresh, `account.updated`, payment method domains | PAY-01 | Test-mode account reaches charges enabled |
| M3-03 | Webhook route: raw-body signature checks (platform and Connect), `system_process_stripe_event`, `provider_events` | R-11 | Bad signature rejected, duplicate ignored |
| M3-04 | Webhook replay test (3 deliveries, concurrent and sequential) | R-11 | acceptance-06 green |
| M3-05 | Pay at booking: hold, PaymentIntent, Payment Element (card, Apple Pay, Google Pay), confirmation screen | PAY-02, PAY-03, R-10 | Paid booking confirmed by webhook |
| M3-06 | Hold expiry and late-payment auto-refund | R-10 | Test with a fake clock |
| M3-07 | Saved cards per Business and learner; manage cards in account | PAY-02 | Card reused on second booking |
| M3-08 | Request to book with manual capture: capture on accept, release on decline or expiry | R-12 | Released authorisation visible in Stripe test mode |
| M3-09 | Pay before lesson: off-session charge 24 h before; authentication fallback link | PAY-03 | Failure notifies both sides |
| M3-10 | Pay after lesson: payment link on completion | PAY-03 | Link pays and marks the booking paid |
| M3-11 | Credit ledger in core: oldest-first lots, returns, fees, expiry, refund valuation | PAY-04, R-07 | Unit tests incl. odd minute splits |
| M3-12 | Ledger schema: `credit_lots`, `credit_ledger` (append-only), `credit_accounts` with non-negative check | PAY-04, PAY-12 | pgTAP: balance always equals ledger sum |
| M3-13 | Package purchase checkout creating a credit lot on webhook | PAY-04 | Lot created once per payment |
| M3-14 | Credit in `create_booking` and `cancel_booking` | PAY-04, R-07, R-10 | acceptance-03 green |
| M3-15 | Offline payments: cash or bank in two taps | PAY-05 | Shows "Paid (cash)" |
| M3-16 | Balances per Business: credit hours, amount owed, history, overdue in red | PAY-06 | Learner and instructor views agree |
| M3-17 | Refunds: `issue_refund` (full or partial, card or credit), Stripe refund job, webhook reconcile, audit row | PAY-07, NFR-SEC-06 | School instructor cannot refund (pgTAP) |
| M3-18 | Cancellation money effects: late fee kept with explanation email; instructor cancel refunds in full | PAY-09, R-06, R-08 | acceptance-04 and acceptance-05 green |
| M3-19 | No-show fee to saved card or credit | PAY-09, R-09 | Dispute window recorded |
| M3-20 | Receipts: email, sequential numbers, VAT lines only when registered, receipt page | PAY-08 | Snapshot tests for both VAT cases |
| M3-21 | Money dashboard: week, month, tax year; paid, unpaid, credit sold, refunds | MNY-01 | Tax year boundary tests (5 and 6 April) |
| M3-22 | Payment notifications: received, failed or overdue, credit low (2 hours left) | NTF-03 | Catalogue entries wired |
| M3-23 | Stripe test-mode runs of acceptance tests 3 to 6 and acceptance-12 with card; milestone report | 17.2 | All green |

M3 Definition of Done: PRD acceptance tests 3, 4, 5 and 6 pass against Stripe test mode, including webhook replay.

## M4 Progress and offline

Goal: a lesson record takes under 60 seconds, works with no signal and syncs later.

| ID | Task | PRD | Done when |
|---|---|---|---|
| M4-01 | Skills reference data from Appendix A (codes, names, sub-skills) and rating scale in core | PRG-02 | Seeded and typed |
| M4-02 | `lesson_records` and `skill_ratings` schema, `save_lesson_record` RPC idempotent on client ID, one record per booking | PRG-01 | pgTAP: replayed save creates one record |
| M4-03 | RLS for records: learner reads own across Businesses, instructor reads own learners, `visibility` respected | PRG-03, 6.2 | Cross-tenant tests green |
| M4-04 | Lesson in progress screen: timer, learner name, skills checklist | 7.5 | Screenshot review |
| M4-05 | Lesson record form: tap skills, rate 1 to 5, summary, next focus, optional homework; seconds-taken captured | PRG-01 | Playwright completes it in under 60 s |
| M4-06 | Learner timeline of lesson records | PRG-03 | Newest first, paginated |
| M4-07 | Learner skill map with progress bars; instructor view for own learners | PRG-03 | Ratings roll up per skill area |
| M4-08 | PWA: manifest from `brand.ts`, icons, install prompt, precache app shell and Today | 8.1 | Lighthouse installable check passes |
| M4-09 | Dexie schema and sync of today's and tomorrow's lessons, learners and skills | PRG-09 | Data present after going offline |
| M4-10 | Offline Today view with offline banner | PRG-09, 8.1 | Playwright offline shows today's lessons |
| M4-11 | Offline lesson record outbox, Background Sync, online and focus fallback, conflict message | PRG-09 | Sync after reconnect, no duplicates |
| M4-12 | "Lesson record added" notification to learner | NTF-03 | Push and in-app delivered |
| M4-13 | Playwright acceptance-08 with the network offline; milestone report | 17.2 | Green at both widths |

M4 Definition of Done: PRD acceptance test 8 passes in Playwright with the network set to offline.

## M5 Public profiles, schools and admin

Goal: public pages that rank and load fast, a working school portal, and a Super Admin that can run the platform.

| ID | Task | PRD | Done when |
|---|---|---|---|
| M5-01 | Cities and areas data for launch regions; city slug from postcode | 8.3 | Leeds, Manchester and London resolve |
| M5-02 | Public instructor profile: allowlisted RPC, cached with tags, next slots, Book or Join waiting list | PUB-01, INS-05 | Private fields absent (test) |
| M5-03 | Public school profile | PUB-01 | Lists visible instructors |
| M5-04 | Structured data: Person, Service, Offer; LocalBusiness and DrivingSchool; BreadcrumbList | PUB-02 | Validates against schema.org types |
| M5-05 | Booking link polish, QR code, share buttons (WhatsApp, Instagram, copy link) | PUB-03 | QR scans to the booking link |
| M5-06 | Hide from search but keep the booking link; expired badge shows "Not taking new bookings" | PUB-04, INS-03 | acceptance-10 green |
| M5-07 | City hub, area and transmission pages; `noindex` below 3 verified instructors | 8.3 | Thin pages carry `noindex` |
| M5-08 | Sitemaps by type, robots, canonical tags, Open Graph images per profile | 14.6 | Sitemap index lists all types |
| M5-09 | Marketing pages: home, learners, instructors software, schools software, pricing (values from config) | 8.3, 9.18 | Copy guard passes |
| M5-10 | Regions: "Coming soon" learner capture (waiting list and lesson request) where the marketplace is off | MKT-10 | Capture stored with consent |
| M5-11 | School onboarding: name, logo, main postcode, number of instructors, invite by email or phone | AUTH-05 | Invited instructor completes short onboarding |
| M5-12 | School overview: lessons today and this week, revenue this month, unpaid, utilisation, new learners | SCH-01 | Figures match seeded data |
| M5-13 | School instructors: invite, deactivate, permissions, pricing control, view diaries | SCH-02 | Deactivated instructor loses access (pgTAP) |
| M5-14 | Learner allocation: manual and suggested (area, transmission, free capacity) | SCH-03, LRN-06 | Suggestions ranked with reasons |
| M5-15 | School-level prices, packages, cancellation policy and booking rules with instructor overrides | SCH-04, R-05, R-06 | Override precedence tested |
| M5-16 | Manager cannot see payouts or billing (UI, RLS, RPCs) | 6.2 | acceptance-11 green |
| M5-17 | Admin shell (desktop, `aal2` only) and dashboard metrics | ADM-01 | Metrics match seeded data |
| M5-18 | Admin users and Businesses: search, view, suspend, reactivate, reset 2FA | ADM-02 | Suspended Business cannot book |
| M5-19 | Admin regions: supply and demand against thresholds, marketplace toggle | ADM-04, 4.2 | Toggle audited |
| M5-20 | Admin platform settings: fees, plan limits, feature flags, default booking rules | ADM-05 | Super Admin only (pgTAP) |
| M5-21 | Read-only impersonation with banner and audit entry | ADM-06 | Writes refused while viewing as |
| M5-22 | Audit log viewer with filters | ADM-07 | Every NFR-SEC-06 action type visible |
| M5-23 | API-level cross-tenant test: Business A requests Business B's learner by ID | NFR-SEC-01 | acceptance-07 green |
| M5-24 | Lighthouse CI on profile and city pages; fix to 90 or higher; milestone report | NFR-PERF-04 | Scores recorded in the report |

M5 Definition of Done: Lighthouse 90 or higher on profile and city pages; PRD acceptance tests 7, 10 and 11 pass.

## M6 Hardening and beta

Goal: safe, observable, accessible and ready for 20 beta instructors.

| ID | Task | PRD | Done when |
|---|---|---|---|
| M6-01 | OWASP Top 10 review with findings fixed | NFR-SEC-03 | Checklist in the report |
| M6-02 | Dependency and licence audit, update policy (Dependabot or Renovate) | NFR-SEC-03 | No high or critical advisories |
| M6-03 | Rate limits confirmed on auth, booking and invite endpoints | NFR-SEC-03 | Integration tests green |
| M6-04 | Enforce CSP and verify security headers | NFR-SEC-03 | No CSP violations in e2e runs |
| M6-05 | k6 load tests for availability and booking; fix hotspots | NFR-PERF-02 | p95 reads under 300 ms, writes under 600 ms |
| M6-06 | axe on every page, keyboard pass, 200% text zoom; fix all serious issues | 14.4 | Zero serious axe issues |
| M6-07 | Legal page shells: privacy, cookies, learner terms, business terms, accessibility statement, with solicitor placeholders | NFR-PRV-02, 15 | Placeholders clearly marked |
| M6-08 | Cookie consent that blocks analytics until accepted | NFR-PRV-02 | No PostHog request before consent (test) |
| M6-09 | Analytics events from PRD section 16, typed, via PostHog EU | 16 | Events fire in e2e runs with consent |
| M6-10 | Sentry on client, server and jobs; uptime checks; alert routing | 14.5 | Test error reaches Sentry |
| M6-11 | Self-service data export (JSON and PDF) | NFR-PRV-03 | Export audited |
| M6-12 | Account deletion: anonymise, keep financial records 6 years | NFR-PRV-03, AUTH-09 | Deleted user cannot sign in; payments retained anonymised |
| M6-13 | `docs/RUNBOOK.md`: deploy, rollback, restore backup, rotate keys, handle a double-charge complaint | 14.5 | Each procedure dry-run once |
| M6-14 | Backups and point-in-time recovery verified; restore drill | NFR-SEC-07 | Restore time recorded |
| M6-15 | All 12 acceptance tests in CI, P1 bug triage, production deploy checklist, beta readiness report | 17.1 | Checklist complete |

M6 Definition of Done: all 12 PRD acceptance tests pass in CI, no open P1 bugs, production deploy checklist complete.

## Phase 1 requirement coverage

| PRD area | IDs | Tasks |
|---|---|---|
| Accounts | AUTH-01 to 09 | M0-22 to M0-27, M1-02 to M1-09, M2-01, M2-03, M5-11, M6-12 |
| Instructor | INS-01 to 05 | M1-03, M1-04, M1-11 to M1-14, M5-02 |
| Coverage | COV-01 to 04 | M1-05 to M1-07, M1-15, M1-16 |
| Diary | DIA-01 to 06, DIA-09 | M1-09, M1-17 to M1-23, M2-24 |
| Bookings | BOK-01 to 10 | M2-14 to M2-26 |
| Learners | LRN-01 to 06 | M2-04 to M2-10 |
| Progress | PRG-01 to 03, PRG-09 | M4-01 to M4-13 |
| Payments | PAY-01 to 09, PAY-12 | M3-01 to M3-23 |
| Money | MNY-01 | M3-21 |
| Notifications | NTF-01 to 04 | M2-27 to M2-30, M3-22, M4-12 |
| Public | PUB-01 to 04 | M5-02 to M5-08 |
| Marketplace | MKT-10 | M5-10 |
| Schools | SCH-01 to 04 | M5-12 to M5-16 |
| Admin | ADM-01 to 07 | M1-12, M5-17 to M5-22 |
| Rules | R-01 to R-14, R-16, R-18 | M0-20, M1-14, M2-11 to M2-25, M3-05 to M3-19 |
| Rules not live in Phase 1 | R-15 (marketplace search), R-17 (pass rate) | No marketplace search or pass rate is shown in Phase 1. City pages apply the R-15 conditions that exist in Phase 1 (verified, active, badge valid) |
| Non-functional | NFR-PERF, NFR-SEC, NFR-PRV, 14.4 to 14.6, 16 | M0-02, M0-03, M0-09, M0-18, M0-19, M5-24, M6-01 to M6-15 |

Totals: 163 tasks of half a day or less. M0 33, M1 24, M2 31, M3 23, M4 13, M5 24, M6 15.
