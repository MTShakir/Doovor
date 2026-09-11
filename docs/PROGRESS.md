# Progress

Last updated: 11 September 2026

## Status

M0 Foundation, branch `m0-foundation`. M0-01 to M0-30 are done and green locally. Next are M0-31 (CI), M0-32 (Vercel and staging, which needs the product owner) and M0-33 (the milestone report).

## Done

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

Decisions D-036 to D-045 were logged during this stretch. Two were security fixes caught by tests:
- D-043: a form submitted before the page was ready could put a password in the URL.
- D-041: a signed-out device kept access until its token expired.

## Test status

| Suite | Result |
|---|---|
| Unit (Vitest) | 135 passed across 5 packages; `packages/core` line coverage 98.4% |
| Database (pgTAP) | 142 assertions in 8 files, all passing |
| End to end (Playwright) | 77 passed at 390 px and 1440 px, none skipped, stable across repeated full runs |
| Lint, typecheck, copy guard | Clean |

## In progress

- M0-31: GitHub Actions CI.

## Next

- M0-32: Vercel project and staging Supabase, with a setup checklist in `docs/RUNBOOK.md`.
- M0-33: milestone report, then wait for "Approved, continue".

## Blockers

| Blocker | Blocks | Needs |
|---|---|---|
| Google OAuth client secret and redirect URIs | Google button (M0-23) locally and on staging | Product owner, when M0-32 starts |
| Vercel project import and environment variables | M0-32 | Product owner |
| Staging Supabase auth settings, email templates and a Resend SMTP sender | M0-32 (hosted sign-up emails) | Product owner |
| Twilio credentials | Hosted text codes (M0-32) | Product owner |
