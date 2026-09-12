# Progress

Last updated: 12 September 2026

## Status

M0 Foundation is approved, merged to `main` and live: the app runs on the brand domain against the hosted Supabase project, with CI green on every push. The milestone report is at https://claude.ai/code/artifact/7b3956cb-d283-46c8-b3fa-a48ac2694c2e

M1 Instructor core has started on branch `m1-instructor-core`. Goal: an instructor finishes onboarding in under 5 minutes and has a working diary.

## M1 progress

| Task | What | PRD | State |
|---|---|---|---|
| M1-01 | Background jobs: runner client, `/api/inngest`, the `outbox_events` table with claim, sent and failed functions, the dispatcher and a one-minute sweep | 14.5 | Done. Verified end to end: an enqueued event was claimed, sent and delivered to a job |
| M1-02 | Onboarding shell: five steps stored on the profile, resume where you left off, only the name is required, finishing opens the diary | AUTH-04 | Done. Steps 2 to 5 are placeholders until M1-04 to M1-09 fill them in |
| M1-03 | Step 1 name and photo: picture cropped, resized and re-encoded in the browser, public `avatars` bucket with a folder per instructor | AUTH-04, INS-01 | Done. A photo carrying a GPS position is stored without it, proved end to end |
| M1-04 | Step 2 badge: private `badges` bucket, storage policies, `submit_verification` RPC with an audit row and a job event | AUTH-04, INS-02 | Done. Another instructor cannot read the badge photo, and nobody sets their own verification status |
| M1-05 | `GeoProvider` over postcodes.io in the new `packages/providers`, postcode rules in core, the cache written through `cache_postcode` (D-057), and a lookup route | COV-03 | Done. Checked against the live service: a real postcode resolves, a well formed one that does not exist is told apart from one that is not a postcode |
| M1-06 | `MapProvider`: circle and bounds geometry in `packages/providers`, Mapbox behind `next/dynamic`, a drawn fallback while there is no map key (D-058) | COV-01 | Done, except the Mapbox path itself, which needs a token to run once |
| M1-07 | Step 3 area: base postcode looked up as it is typed, radius slider from 1 to 30 miles, the circle following it | COV-01, AUTH-04 | Done. The server resolves the postcode itself, so no coordinates are taken from the browser |
| M1-08 | Step 4 prices: one hourly price and an optional ten hour block, turned into a lesson type, three durations and a package in one transaction | AUTH-04, R-05, PAY-04 | Done. Setting prices again changes them rather than making a second set |
| M1-09 | Step 5 hours: the days they teach and one pair of times (D-059), written as a row per day in local wall clock | AUTH-04, DIA-01 | Done. Onboarding is complete: five steps, only the name required |
| M1-10 | Today screen with the setup checklist: first learner, payments, booking link | 10.1 | Done. Every row is worked out from real rows, and the card disappears when the list is finished |
| M1-11 | Profile editor: photo, name, bio, languages, years, car, transmission, dual controls, specialisms, with the badge shown but not editable | INS-01 | Done. One Zod schema decides the form and the server |
| M1-12 | Admin verification queue: the badge photo through a signed address, approve or reject with a reason, audit row, and the tick | INS-02, ADM-03 | Done. Only staff with two-step verification can decide, proved in pgTAP and end to end |
| M1-13 | Badge expiry: rules in core, a daily job at 07:00 London warning at 60, 30 and 7 days, and an expired badge taken out of search | INS-03 | Done. A reminder is recorded before it is sent, so a retry cannot send it twice |
| M1-14 | Trainee instructors: the label on the profile, supervision given by the school, and R-18 enforced on the booking row itself (D-061) | INS-04, R-18 | Done. An unlinked trainee cannot take a booking, whatever writes it |
| M1-15 | Coverage: districts added and left out, `covers_postcode` answering the whole rule in one place, and the base postcode and radius editable after onboarding | COV-01, COV-02 | Done. Something that is not a district is refused in the form and by a constraint |
| M1-16 | Pickup points: exactly one default per learner enforced by the database, the postcode resolved on the server, and the picker in the design system | COV-04 | Done. The picker has no screen to live on until learner management arrives in M2 |
| M1-17 | Diary settings: the week a day at a time, plus one-off time off and extra hours, with overlaps settled when they are written | DIA-01, DIA-02 | Done. No moment can be both open and blocked |
| M1-18 | Booking rules: buffer and instant booking for the instructor, notice, horizon, cancellation and request expiry for the Business, layered over the platform defaults | 11.1, DIA-05, DIA-06, BOK-06 | Done. Every range from PRD 11.1 is enforced in the schema and again in the database |
| M1-19 | Diary day view: one word per lesson, the gaps worth filling, and navigation that lives in the address bar | DIA-03, DIA-04 | Done. Reviewed at 390 px |

## Done (M0)

| Tasks | What | PRD |
|---|---|---|
| M0-01 to M0-05 | pnpm 12 workspace, Turborepo, strict TypeScript 6, ESLint 10 with package boundaries, copy guard (brand values, dashes), `brand.ts`, flags, plans, typed env | 8.1, 9.18, NFR-SEC-02 |
| M0-06, M0-07 | Money in integer pence, domain error codes, London time helpers with clock-change rules | 7.6, R-14 |
| M0-08 to M0-15 | Next 16 app with Cache Components, security headers, design tokens, component library, portal shells, `/design` page | 7.2, 7.4, 8.2 |
| M0-16 to M0-20 | Local Supabase, tenancy and RLS helpers, append-only audit log, the core Phase 1 schema with database-enforced double booking protection | 6.1, 6.2, 12, R-01 to R-03, NFR-SEC-01, NFR-SEC-06 |
| M0-21 | Generated types, typed access context, server, browser and proxy Supabase clients | 6.1 |
| M0-22 | Sign up and sign in with email and password or a magic link, email confirmation, password reset | AUTH-01 |
| M0-23 | Google button behind a flag (hidden until the client secret is set); Apple hidden by product owner choice | AUTH-01 |
| M0-24 | Mobile capture and text code verification for instructors, and sign in with a text code | AUTH-02 |
| M0-25 | `/start` role choice and account bootstrap (learner profile, independent Business, school Business with the founding offer) | AUTH-03, 9.18 |
| M0-26 | TOTP set-up and challenge, required for staff and school owners | AUTH-08 |
| M0-27 | Account page: details, devices, sign out one device or all (immediate, D-041), deletion request | AUTH-09 |
| M0-28, M0-29 | Deterministic seed: 16 people across every role, Leeds independent instructor, Manchester school with 3 instructors (one PDI), 8 learners, catalogue, hours and 109 lessons | 12 |
| M0-30 | Every seeded role signs in and lands on its portal, at 390 px and 1440 px | AUTH-03 |
| M0-31 | GitHub Actions on every push: lint and copy guard, types, unit tests with the coverage gate, SQL lint, pgTAP, generated-types check, and Playwright against a production build with report and screenshots as artefacts | 14.5 |
| M0-32 | Runbook with the staging checklist, hosted auth settings as code in `[remotes.staging]` applied by one reviewed command (D-050), `apps/web/vercel.json` pinned to London, noindex outside production (D-047), `pnpm db:env`, safe hosted seeding (D-048) | 8.1 |

Decisions D-036 to D-050 were logged during this stretch. Two were security fixes caught by tests:
- D-043: a form submitted before the page was ready could put a password in the URL.
- D-041: a signed-out device kept access until its token expired.

## Test status

| Suite | Result |
|---|---|
| Unit (Vitest) | 293 passed across 6 packages; `packages/core` line coverage 99%, `packages/providers` 100% |
| Database (pgTAP) | 290 assertions in 22 files, all passing; SQL lint clean |
| End to end (Playwright) | 131 passed at 390 px and 1440 px, none skipped, stable across repeated full runs, also against a production build in CI mode |
| Lint, typecheck, copy guard | Clean |
| CI on GitHub | Green: lint and unit, database, end to end against a production build |
| Staging (hosted) | Security Advisor: 0 errors, 6 expected warnings (D-051). Every public table has row-level security. The sign-out guard (D-041) is active on the authenticator role. Health check and sign-in page verified |

## In progress

- M1-20: the week view, which is the desktop default.

## Next

- M1-20 to M1-24: the week and month views, the school diary, realtime, and the timed onboarding run.
- The seven M1 migrations are applied locally only. They go to staging with the next staging push.

## Blockers

| Blocker | Blocks | Needs |
|---|---|---|
| Google OAuth client secret | The Google button, which stays hidden until it is set | Product owner |
| Twilio account off trial | Text codes to a number that is not pre-registered, on staging | Product owner |
| Mapbox access token | The real map on the coverage step. The drawn fallback ships meanwhile (D-058) | Product owner |
