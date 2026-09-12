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
| Unit (Vitest) | 178 passed across 5 packages; `packages/core` line coverage 97.8% |
| Database (pgTAP) | 184 assertions in 12 files, all passing; SQL lint clean |
| End to end (Playwright) | 89 passed at 390 px and 1440 px, none skipped, stable across repeated full runs, also against a production build in CI mode |
| Lint, typecheck, copy guard | Clean |
| CI on GitHub | Green: lint and unit, database, end to end against a production build |
| Staging (hosted) | Security Advisor: 0 errors, 6 expected warnings (D-051). Every public table has row-level security. The sign-out guard (D-041) is active on the authenticator role. Health check and sign-in page verified |

## In progress

- M1-05: `GeoProvider` over postcodes.io, with the `postcodes` cache table.

## Next

- M1-05 to M1-09: `GeoProvider` and `MapProvider`, postcode and radius, prices, weekly hours.
- The four M1 migrations (`outbox_events`, onboarding columns, avatar photos, badge verification) are applied locally only. They go to staging with the next staging push.

## Blockers

| Blocker | Blocks | Needs |
|---|---|---|
| Google OAuth client secret and redirect URIs | Google button (M0-23) locally and on staging | Product owner, when M0-32 starts |
| Vercel project import and environment variables | M0-32 | Product owner |
| Staging Supabase auth settings, email templates and a Resend SMTP sender | M0-32 (hosted sign-up emails) | Product owner |
| Twilio credentials | Hosted text codes (M0-32) | Product owner |
