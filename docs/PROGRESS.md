# Progress

Last updated: 14 September 2026

## Status

M0 Foundation is approved, merged to `main` and live: the app runs on the brand domain against the hosted Supabase project, with CI green on every push. The milestone report is at https://claude.ai/code/artifact/7b3956cb-d283-46c8-b3fa-a48ac2694c2e

M1 Instructor core is approved and merged to `main`, all 24 tasks, with its fifteen migrations applied to staging. The milestone report is at https://claude.ai/code/artifact/92224816-1b7a-4eef-bd86-0ab470cb16ae

M2 Learners and bookings is approved and merged to `main`, and was pushed to staging on 13 September 2026.

M3 Payments is in progress on branch `m3-payments`: M3-01 to M3-22 are built, and M3-23 has its card form. The Stripe test-mode run, which also covers the Stripe halves of M3-08 to M3-10, waits on the owner items under Blockers. The app now lives on `app.doovor.com` with the public site on `doovor.com` (D-084).

## M3 progress

| Task | What | PRD | State |
|---|---|---|---|
| M3-01 | `PaymentsProvider`: the interface, Stripe Connect with direct charges, and an in-memory fake | 13, PAY-01 | Done. One contract suite, run against the fake now and against Stripe test mode in M3-23 |
| M3-02 | Connect Express onboarding: the account, the link, coming back, and what is still missing | PAY-01 | Done. An owner connects payments from the Money screen in either portal; only owners can. The fake's onboarding is a page of the app, so the whole round trip runs locally |
| M3-03 | The webhook route: the signature on the raw body, `provider_events`, and applying an event in the same transaction as recording it | R-11 | Done. A forged or tampered body is refused; three deliveries of one event at the same moment leave one row and one effect |
| M3-04 | The replay test itself | R-11 | Done. The concurrent and sequential replays are green at the route and in pgTAP, and acceptance-06 counts one payment and one credit entry after a package payment is delivered three times, in both (M3-13) |
| M3-05 | Pay at booking: the hold, the payment, the confirmation, and the webhook that confirms the lesson | PAY-02, PAY-03, R-10 | Done. The slot is held for fifteen minutes while a card is found, the webhook records the payment once and confirms the lesson, and a refused card leaves the lesson waiting rather than lost |
| M3-06 | Hold expiry and late payment: the sweep that gives a slot back, and the refund when money arrives too late | R-10, PAY-07 | Done. A learner booking a Business that takes cards gets a lesson that is held rather than confirmed, and a hold that runs out puts the time back in the diary and calls the attempt off. Money that lands after that gets the lesson back if the slot is still free, and gets refunded if somebody else has taken it |
| M3-07 | Saved cards per Business and learner, and managing them | PAY-02, R-11 | Done. A learner chooses to keep a card (D-079), sees it offered first on their next lesson with that Business, and pays with one press; the webhook confirms it as for any card. Payments lists kept cards per Business and removes them with undo. Cards live only with the provider (D-080). A second payment for a lesson already paid for is now refunded on its own, which saved cards made easy to cause |
| M3-08 | Request to book with manual capture: authorise, capture on accept, release on decline or expiry | R-12, PAY-03 | Done locally. A request at a Business that takes cards authorises the card, typed in or kept; accepting takes it, declining, running out or cancelling lets it go, and the learner is told which. Capture and release are one sweep (D-081). The Stripe half of the done-when, a released authorisation seen in Stripe test mode, is part of the M3-23 run, which waits on the platform profile acknowledgements |
| M3-09 | Pay before lesson: charge the saved card the day before, with a fallback to paying on screen | PAY-03, NTF-03 | Done locally. An owner chooses how learners pay, and each lesson keeps the terms it was booked on. A lesson paid the day before asks the learner only for a card, saved with nothing taken, and says when it will be charged. A job charges the newest working card with nobody there; a lesson it cannot charge stays on, tells the learner, instructor and school why (D-082), and asks the learner to pay on screen, where their bank can check it is them. Paying on screen when the bank asks mid-charge waits for the Payment Element in M3-23 |
| M3-10 | Pay after lesson: the payment link when a lesson is marked done | PAY-03 | Done locally. Marking a lesson done that is paid for afterwards sends the learner "Pay for your lesson" by inbox, push and email, linked straight to its pay screen (D-083); the learner history shows a Pay button until it is paid, and paying marks it paid. The owner can now choose all four ways of being paid on the Money screen |
| M3-11 | Credit ledger in core: oldest lots first, returns, fees, expiry, refund valuation | PAY-04, PAY-07, R-07 | Done. Pure rules in packages/core/src/credit.ts: lessons take whole lessons of credit from the oldest lots, a cancelled lesson returns every minute to its own lot and keeps any fee from the same lots, expired credit leaves the balance lot by lot, and unused credit is refunded at the price its lot was bought for, rounded down but worked out from what is left so pieces always add up to the whole |
| M3-12 | Ledger schema: `credit_accounts`, `credit_lots`, `credit_ledger` append-only, balance never below nothing | PAY-04, PAY-12 | Done. The ledger is the truth: a row moves its lot and its account by trigger, and nothing else can change either (D-085). A lesson cannot use more than there is, a lot cannot be given back more than was bought, a payment buys one lot once, and credit with one Business cannot be spent with another or held by anybody who is not its learner. pgTAP checks that every balance and every lot still equals its ledger after four hundred random moves, 177 applied and 223 refused. The learner, the Business's owners and managers, and the instructor who teaches the learner see it; nobody writes to it directly |
| M3-13 | Package purchase: checkout, and a credit lot created by the webhook | PAY-04, PAY-12, R-11 | Done. Payments shows a learner their credit with each Business they learn with and the packages it sells; a package opens on a screen of its own with its price, price an hour, time limit and what credit is for, and is bought with a kept card or a new one. The learner has to ask for their lessons to start straight away, and is told what changing their mind within 14 days gives back (D-086). The webhook writes the payment, the lot and its purchase row once, from what the payment says it buys; money from somebody who does not learn with the Business is refunded, and an event from another Business's account changes nothing (D-087). acceptance-06 is green in pgTAP and through the route |
| M3-14 | Credit in `create_booking` and `cancel_booking` | PAY-04, R-07, R-10 | Done. A lesson is paid from credit whenever there is enough for all of it, in the transaction that books it, oldest lots first, whoever books it, weekly slots included; nothing is held and no card is asked for (D-088). Cancelling in time, or by the instructor, gives every minute back to the lots it came from; late, the fee is kept from that credit, and the cancel warning, the notice and the pay screen say so in minutes rather than money. A request is paid from credit when it is made and gets it back when it is declined or lapses; a lesson made a different length pays for its new length. acceptance-03 is green in pgTAP and end to end at both widths |
| M3-15 | Offline payments: cash or bank in two taps | PAY-05 | Done. An unpaid lesson in the instructor's diary has Mark paid; Cash or Bank transfer records it, and the lesson shows "Paid (cash)" or "Paid (bank)" in the diary and in the learner's own lessons. Undo takes a slip back out for ten minutes (D-089). A lesson held for a card is confirmed by it, and a card payment that lands afterwards is refunded. Requests, lessons called off and free lessons are refused, and only the lesson's instructor or somebody who manages bookings can record one. A package paid for in person is recorded from the learner card, which comes with balances (M3-16) |
| M3-16 | Balances per Business: credit hours, amount owed, history, overdue in red | PAY-06 | Done. The learner's Payments screen shows, for each Business they learn with, their credit, what they owe with the overdue part in red, each lesson owed for with a Pay button where the Business takes cards, the packages on sale, and recent history. The instructor's learner card has the same Money section, from the same function and the same components, with Mark paid on the lessons they may mark and a way to record a package paid for in person (D-090). pgTAP proves the learner, their instructor and the owner get identical facts, a lesson owed to a colleague included; end to end, both screens show the same lines before and after the instructor records a package and marks an overdue lesson paid, at both widths |
| M3-17 | Refunds: `issue_refund` (full or partial, card or credit), refund job, webhook reconcile, audit row | PAY-07, NFR-SEC-06 | Done. An owner or manager refunds from the learner card's history, always with a reason kept in the audit log: a lesson by an amount, back the way it was paid (to the card through the refund job, or handed back in cash or by transfer) or as credit, and unused credit by the time left at the price it was bought for, which leaves the balance at once and comes back if the refund fails (D-091). The webhook settles refunds from the provider's refund events, finds its own by the id they carry, and records ones made in the Stripe dashboard. A school instructor cannot refund, in pgTAP and on screen. Recording a refund on a lesson recomputes the lesson's payment status from all its payments, so a refunded duplicate leaves it paid. The hosted webhook needs the refund events added (RUNBOOK 3.7) |
| M3-18 | Cancellation money effects: late fee kept with explanation email; instructor cancel refunds in full | PAY-09, R-06, R-08 | Done. Cancelling settles the lesson's money in the same transaction (D-092): a learner cancelling late leaves the fee kept out of what they paid, oldest payment first, and the rest goes back; in time, or when the instructor or the Business cancels, all of it goes back, to the card through the refund job or owed back for cash and transfers until it is marked handed back from the learner card. A fee on an unpaid lesson is owed in both balances and can be marked paid in person for the fee. The cancel sheets, the pay screen and the notification say what happens to the money, and the learner's email explains a kept fee: when they cancelled, the policy, and what it came out of. Withdrawing a request or dropping a held slot is no longer a late cancellation. acceptance-04 and acceptance-05 are green in pgTAP, in unit tests of the email, and end to end at both widths, where the refund reaches the fake card and the notification is written by the real job |
| M3-19 | No-show fee to saved card or credit | PAY-09, R-09 | Done. A no-show settles its money as a late cancellation, out of credit or what was paid, and records the seven days the learner has to dispute it. A fee nothing has paid, for a no-show or a late cancellation, is charged by a job to the card the learner keeps, or is owed and paid on the pay screen or in person, and the "Save this card" box now says fees can be charged to it (D-093). The learner disputes from their lessons within the seven days, and an owner or manager waives the fee, which gives back whatever paid it, or keeps it, from the learner card, with a note the learner sees (D-094). Learner, instructor and school are told at each step. pgTAP, unit and end to end green at both widths |
| M3-20 | Receipts: email, sequential numbers, VAT lines only when registered, receipt page | PAY-08 | Done. Every payment received gets a receipt numbered in its Business's own series, with the name, address and VAT number frozen as they were, what was paid for, the amount and how it was paid, and the VAT in the price only for a Business registered for VAT. A job emails it once, and cash waits out its ten-minute undo window first. The owner sets the address and VAT number on the Money screen. The receipt page prints, and each payment in both histories links to its receipt (D-095). Snapshot tests cover the email with and without VAT; pgTAP covers numbering, VAT to the penny, frozen details and who reads receipts; end to end at both widths |
| M3-21 | Money dashboard: week, month, tax year; paid, unpaid, credit sold, refunds | MNY-01 | Done. The Money screen opens with "Money in" for this week, this month or this tax year: paid by card, cash and bank transfer, unpaid lessons and fees, credit sold and refunds. Periods are days in London, and the tax year runs from 6 April to 5 April. Owners and managers see the whole Business; a school instructor sees their own lessons and no credit sold (D-096). Unit tests cover the 5 and 6 April boundary in London time, and summer time either side of midnight; pgTAP shows a payment at 23:59:59 on 5 April and cash at 00:00 on 6 April landing in different tax years, and who may read what; end to end at both widths |
| M3-22 | Payment notifications: received, failed or overdue, credit low (2 hours left) | NTF-03 | Done. A payment received tells the learner in the app and on their phone, since the receipt is their email, and the instructor on every channel. The person who marked cash paid is not told, and nobody is told until the cash can no longer be undone. A school's owners and managers get one summary of the day before each morning. A lesson or fee still owed two days after it was due is told once to the learner, the instructor and the school; for a lesson paid in person, the instructor is asked to mark it paid instead of the learner being chased. Using credit that leaves 2 hours or less tells the learner and their instructor, once for each package bought (D-098). Failed payments were wired in M3-09 and M3-19. pgTAP covers who each notification concerns, the undo window, when money is overdue and the 2-hour line. Unit tests cover the words, the recipients, the jobs, and a London day when the clocks go back. End to end, a card payment writes both notifications through the real job |
| M3-23 | Stripe test-mode runs of acceptance tests 3 to 6 and acceptance-12 with card; milestone report | 17.2 | In progress. The card form is built. Card details go into Stripe's Payment Element on the pay, package and save card screens, dressed as our inputs, with our own words for what went wrong. A kept card the bank wants to check is checked on the screen (D-099). Unit tests cover the error words and the bank check in both checkout actions; the fake runs are unchanged. The run against Stripe test mode waits on the owner items under Blockers (RUNBOOK 3.7a) |

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
| Unit (Vitest) | 834 passed across 7 packages; `packages/core` and `packages/providers` both above the 90% line coverage gate |
| Database (pgTAP) | 875 assertions in 65 files, all passing, including against a database an end to end run has left data in, and none of them depends on the date or the day of the week they run on (D-070); SQL lint clean |
| End to end (Playwright) | 274 at 390 px and 1440 px on 14 September, none skipped, including acceptance-01 to 06, 09 and 12 and the payment journeys for M3-05 to M3-22. One run had the saved-card removal step fail once under full load and passed when its file ran again; it is being watched; green in CI on every push since 13 September |
| Lint, typecheck, copy guard | Clean |
| CI on GitHub | Read after every push. Green on fa288bf (14 September). Two pushes that day failed and were fixed in the next: a pgTAP test that only passed from Thursday to Sunday (c06c1e0), and an accessibility check that caught the portal's loading skeleton mid-scan (635fe19) |
| Staging (hosted) | All 46 migrations applied, M2 pushed on 2026-09-13. Security Advisor: 0 errors, 39 warnings, 38 of them the expected `security definer` pattern (D-051) and one the dashboard switch for leaked password protection |

## In progress

- M3 Payments. M2 was approved on 2026-09-13, merged into `main` and pushed to staging.

## Next

- M3: payments. Stripe Connect, the Payment Element, credit, and the money side of cancellation.

## Blockers

| Blocker | Blocks | Needs |
|---|---|---|
| Google OAuth client secret | The Google button, which stays hidden until it is set | Product owner |
| Twilio account off trial | Text codes to a number that is not pre-registered, on staging | Product owner |
| Mapbox access token | The real map on the coverage step. The drawn fallback ships meanwhile (D-058) | Product owner |
| Leaked password protection | One dashboard switch on staging, found by the M1 security advisor. RUNBOOK 3.1 step 4 | Product owner |
| VAPID key pair for staging and production | Push from those environments. Generated with one command, no account needed. RUNBOOK 3.2a | Product owner |
| Stripe platform profile acknowledgements | The Stripe test-mode runs in M3-23: connected accounts cannot be created until they are accepted | Product owner, in the Stripe dashboard |
| Stripe CLI signed in on this machine | The local webhook signing secret and `pnpm stripe:listen`. Installed (1.50.11) on 14 September, not yet signed in. RUNBOOK 3.7a | Product owner, `stripe login` |
| Who operates Stripe test mode in the run | Creating the test connected account, onboarding it with Stripe's test values and accepting its terms, and taking test payments. Claude's permission checks stop at creating a connected account, even in test mode. RUNBOOK 3.7a | Product owner: allow it for the run, or do those steps |
| Inngest connected to Vercel | Emails, reminders and payment jobs from staging and production | Product owner |
