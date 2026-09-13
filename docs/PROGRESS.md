# Progress

Last updated: 12 September 2026

## Status

M0 Foundation is approved, merged to `main` and live: the app runs on the brand domain against the hosted Supabase project, with CI green on every push. The milestone report is at https://claude.ai/code/artifact/7b3956cb-d283-46c8-b3fa-a48ac2694c2e

M1 Instructor core is approved and merged to `main`, all 24 tasks, with its fifteen migrations applied to staging. The milestone report is at https://claude.ai/code/artifact/92224816-1b7a-4eef-bd86-0ab470cb16ae

M2 Learners and bookings has started on branch `m2-learners-bookings`. An instructor signs up, is set up in five minutes, is verified by a person, and has a diary that keeps itself up to date.

## M2 progress

| Task | What | PRD | State |
|---|---|---|---|
| M2-01 | Learner onboarding: name, postcode, gearbox, experience and a date of birth that stays the learner's own | AUTH-06, R-16 | Done. Under 16 is refused by the form and by the row itself |
| M2-02 | Rate limiter: fixed windows counted in Postgres, behind a `RateLimiter` interface, with the limits in one catalogue and a daily sweep | NFR-SEC-03, D-008 | Done. A limiter that cannot answer refuses rather than letting everything through |
| M2-03 | Invitations: a hashed one-use token, shared by WhatsApp, text or email, a landing page that names the instructor, sign-up already filled in, and the link accepted once the account exists | AUTH-07 | Done. Only the hash is stored, so a copy of the table is not a set of working invitations |
| M2-04 | Learner list: search by name or number, the four filters LRN-01 names over the six statuses, and calling or texting in one tap | LRN-01 | Done. One view answers the list, so forty learners is still one query. Booking from the row arrives with the booking sheet (M2-16) |

| M2-05 | Learner card: contact and the three ways to reach them, lessons taken, hours driven, next and last lesson, and their pickup points | LRN-02, COV-04 | Done in one query, through a view on the list view. Notes arrive with M2-06, the balance with payments (M3), and the test date with TST-01, which the PRD puts in Phase 2 |

| M2-06 | Private notes on the learner card, with five seconds to undo a deletion, and tests that no learner path reaches them | LRN-04 | Done. pgTAP proves it three ways: the table, no view built on it, and no `security definer` function that reads it |

| M2-07 | Learner status workflow: the six statuses, changed from the card in one tap, through an RPC that checks the permission and records the move | LRN-05 | Done. Nobody holds an update grant on the relationship, so the RPC is the only way a status changes, and every change is in the audit log |

| M2-08 | Add a learner by hand: one sheet offering a link or their details, an account they claim later (D-068), and the duplicate check LRN-03 asks for | LRN-03 | Done. The same number twice is caught before a second account is made, and a contact that already has an account is sent to the invite link instead |

| M2-09 | CSV import: the file read in the browser, columns guessed and changeable, a preview, then batches of twenty with a report of every row left out and why | LRN-03 | Done. A 120 row file is read, checked and reported in a unit test; the screen imports in batches so a long file reports as it goes |

| M2-10 | The school's own learner list, handing a learner to another instructor, and the history that follows them | LRN-06 | Done. The history is read through an RPC, so the people who work with a learner see their story without the audit log being opened to them |

| M2-11 | Availability engine part 1: working hours and exceptions turned into plain UTC windows, including both clock changes | R-04, R-14 | Done. The hour that does not happen in March cannot be booked, and the hour that happens twice in October is counted once |
| M2-12 | Availability engine part 2: buffers, notice, horizon, step, and the difference between what a learner may book and what an instructor may | R-01, R-04, DIA-05, DIA-06 | Done. Core coverage 97.6% of lines, above the 90% gate |
| M2-13 | One set of availability vectors, run by Vitest against the TypeScript rules and by pgTAP against the SQL ones | R-04 | Done. 20 vectors, both runners green, and `pnpm db:test` regenerates the SQL from the JSON so they cannot drift |

| M2-14 | `create_booking`: who is asking, what they may book, what it costs, whether the slot is free, then the row, the audit line and the message, in one transaction | BOK-01, BOK-02, BOK-07, R-10 | Done. acceptance-01 passes through the RPC, and a learner booking for the first time joins the Business as they do it |
| M2-15 | Two learners taking the same slot at the same moment, in two real transactions | BOK-07, R-02 | Done. acceptance-02: exactly one succeeds, the other is told the slot has just gone |

| M2-16 | The instructor's booking sheet: who it is for, when it is, and yes, with times outside their hours offered separately and a warning before one is taken | BOK-01, BOK-03, BOK-04, R-04 | Done. Three taps from the diary at 390 px, and the length follows what that learner usually books |

| M2-17 | Self-booking at a public link: who the instructor is, what a lesson costs, the times they are free, and one tap to take one | BOK-02 | Done at 390 px, in well under a minute (acceptance-12). A visitor with no account keeps their choice while they make one (D-069) |

| M2-18 | Request to book: accept or decline from the diary, a reason with a decline, and a sweep every five minutes for the ones nobody answered | BOK-06, R-12 | Done. A lapsed request frees the slot, and the sweep marks it rather than leaving it to look live |

| M2-19 | Recurring bookings: a weekly plan, the lessons it makes, and a result for every week rather than all or nothing | BOK-05, R-13 | Done. acceptance-09 at database level: a weekly nine o clock lesson is still at nine o clock after the March clock change |
| M2-20 | Repeat weekly in the booking sheet, the weeks that clashed listed back, and a nightly job that keeps an open ended slot booked a month ahead | BOK-05 | Done. Four weeks booked in one go from the diary |

| M2-21 | The cancellation policy in core: who cancelled, how late, how it was paid for | R-06 to R-09 | Done. Eleven rows of the policy table as eleven unit tests, no-show included |
| M2-22 | `cancel_booking`: a reason from an instructor, the late flag and the fee recorded on the booking | BOK-09 | Done. An instructor cancelling costs the learner nothing however late it is, and has to say why |
| M2-23 | `reschedule_booking`: an instructor moves a lesson whenever they like, a learner until the free window closes | BOK-08 | Done. A lesson is not counted as being in its own way, and a learner inside the window is told to ring instead |

| M2-24 | Dragging a lesson into a gap on a desktop, holding one on a phone, and putting it back when the server will not have it | DIA-03, BOK-08 | Done. The move shows before the server has agreed and rolls back on a clash |

| M2-25 | Marking a lesson done, and one nobody came to, a quarter of an hour after the start and not before | BOK-10, R-09 | Done. A lesson in the past offers those two answers instead of move and cancel. The lesson record itself is M4 |

| M2-26 | The learner's own lessons: what is coming up, what has happened, and the move and cancel sheets | BOK-08, BOK-09, 8.2 | Done. A learner is told what a late cancellation costs before they confirm it, and the times either side of the lesson they are moving are now offered |

| M2-27 | The notification core: the Appendix B catalogue, `notifications` and `notification_preferences`, the settings screen and the job that writes them | NTF-01, NTF-03, NTF-04 | Done. A repeated event writes one row, not two, and a service message reaches the inbox whatever is switched off. Proved end to end locally: a booking event went outbox to job runner to two notifications, one worded for each side |

| M2-28 | Email: a provider interface with Resend behind it, the React Email template, and the job that sends what the core wrote | NTF-03 | Done. Every notification in the catalogue renders without an em or en dash, in HTML and in words. Proved end to end locally: a cancelled lesson reached the log provider as two emails, one for each side |

| M2-29 | The service worker spike (Serwist with Turbopack) and web push: VAPID, signing a browser up, the push handler | NTF-01 | Done, spike passed (D-073). A push delivered through the devtools protocol reaches the worker and is passed on to the open app, at 1440 px in Playwright. The worker precaches nothing yet, by choice |

| M2-30 | Reminders before a lesson, what a Business sets, and text messages on Pro with the monthly cap | NTF-02, NTF-01 | Done. A lesson that moved is reminded about at its new time only, by unit test and by the key each reminder carries. Proved end to end locally: a lesson twenty hours out became a reminder, an email and a text, counted against the allowance |

| M2-31 | The four acceptance tests this milestone owns, named and green at both widths | 17.2 | Done. acceptance-01, 02, 09 and 12 run at 390 px and 1440 px, eight runs in all |

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
| M1-20 | Diary week view, seven days across, and the day on a phone with the week on a desktop when nobody has chosen | DIA-03 | Done. Reviewed at 1440 px |
| M1-21 | Diary month view, on the design system's month grid, with a dot on every day that has lessons | DIA-03 | Done. Choosing a day opens that day |
| M1-22 | School diary: every instructor side by side for a day, filtered by instructor and transmission (D-062 on branches) | DIA-09 | Done. A manager sees all of them; an instructor at the school sees only their own |
| M1-23 | Live diary: the database broadcasts on a private topic per instructor, and an open diary catches up on its own (D-063) | DIA-03 | Done. A lesson cancelled from outside the page shows on it without a reload |
| M1-24 | A timed run at 390 px: sign up, verify the mobile, and fill in all five steps including both photos | AUTH-04 | Done. 8 seconds of machine time against a production build, well inside the five minutes the milestone claims |

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
| Unit (Vitest) | 532 passed across 7 packages; `packages/core` line coverage 97.4%, `packages/providers` 100%, both above the 90% gate |
| Database (pgTAP) | 510 assertions in 43 files, all passing; SQL lint clean |
| End to end (Playwright) | 229 passed at 390 px and 1440 px, including acceptance-01, 02, 09 and 12 at both widths, none skipped, stable across repeated full runs |
| Lint, typecheck, copy guard | Clean |
| CI on GitHub | Last read green on M1. Not read for the M2 branch: the repository is private and this machine has no GitHub CLI |
| Staging (hosted) | All 23 migrations applied. Security Advisor: 0 errors, 17 warnings, 16 of them the expected `security definer` pattern (D-051) and one a dashboard switch for leaked password protection, now in the runbook |

## In progress

- Nothing. M2 is complete and its report is delivered, waiting for approval before the merge to main.

## Next

- M3: payments. Stripe Connect, the Payment Element, credit, and the money side of cancellation.
- The M2 migrations are applied locally only. They go to staging with the next staging push.

## Blockers

| Blocker | Blocks | Needs |
|---|---|---|
| Google OAuth client secret | The Google button, which stays hidden until it is set | Product owner |
| Twilio account off trial | Text codes to a number that is not pre-registered, on staging | Product owner |
| Mapbox access token | The real map on the coverage step. The drawn fallback ships meanwhile (D-058) | Product owner |
| Leaked password protection | One dashboard switch on staging, found by the M1 security advisor. RUNBOOK 3.1 step 4 | Product owner |
| Resend API key for the app | Real email from staging and production. Local and test runs write to the log and send nothing. RUNBOOK 3.2 step 3 | Product owner |
| VAPID key pair for staging and production | Push from those environments. Generated with one command, no account needed. RUNBOOK 3.2a | Product owner |
