# Beta readiness

Written 18 September 2026, at the end of M6 (PRD 17.1, M6-15), and kept up to date as the
beta-prep work lands. It says what the product does, what proves it, and what is not ready. It is
meant to be read before letting twenty instructors run their working week on this.

## The short answer

The product is ready for a beta **once four things the product owner holds are done**: the Sentry
DSN and the uptime check (M6-10), production on the Supabase Pro plan, which is what keeps backups, and a restore drill (M6-14), a solicitor through the
legal pages (M6-07), and Stripe in live mode (RUNBOOK 3.7). Everything else is built, tested and
green in CI.

## What a beta instructor can do today

Sign up, be verified, set their area, hours and prices, and appear on a public profile and city
page that search engines can read. Add learners by hand, by invitation or from a spreadsheet. Book
single and weekly lessons, move them, cancel them, and have the buffer and notice rules enforced
rather than remembered. Take card payments into their own Stripe account, sell packages as credit,
record cash and bank transfers, refund, and issue receipts. Write a lesson record in under a minute
with no signal and have it send itself later. See the money they are owed and what they have taken.
A school can do all of that across several instructors, allocate learners, and keep its own rules.

Since then: a Business on a plan that carries it keeps a wall of pass photos on its public profile,
with the name and the date on each and a tick on the ones we have checked (D-218). A new lesson
starts from where that learner's lessons start, and either side can move one lesson somewhere else
(D-215). Free carries ten learners at a time, and what is coming to a plan says so rather than
being sold (D-208, D-209, D-212). And a name and a business name can be changed from Account and
security (D-217).

A learner can find an instructor, book from a link, pay, see their lessons, their credit and their
progress against the DVSA syllabus, and take their data or close their account.

## What proves it

| | |
|---|---|
| Unit tests | 1,525 across the packages (core 688, web 631, providers 110, db 41, ui 26, config 22, emails 7), core at 95.8% line coverage against a 90% gate |
| Database tests | 1,809 pgTAP assertions across 126 files: every RLS policy, constraint and RPC, including the failure paths. Run twice, the second time with the database's clock set away from the United Kingdom's (D-156) |
| End to end | 573 tests at 390 px and 1440 px against a production build, with an accessibility scan on every screen |
| The twelve acceptance tests | All present and passing in CI, each named `acceptance-01` to `acceptance-12`, with a roll call that fails the build if one is renamed, deleted or skipped |
| Public pages | Lighthouse 91 to 96 on performance and 100 on accessibility, best practices and SEO, largest paint 2.6 to 3.3 seconds |
| Load | Reads p95 56 to 104 ms, a booking p95 32 ms, against the 300 ms and 600 ms the PRD asks for |
| Security | The OWASP Top 10 reviewed with its three findings fixed, the content security policy enforced and proved by an end to end sweep, and no dependency advisory above low |
| Accessibility | Zero serious or critical issues on every screen, at both widths, with the keyboard able to reach everything and text at 200% not pushing any page sideways |

Every one of those runs in CI on every push. CI is green on 9707c32 (29 September), all five jobs.

A note on reading CI: the runs on `beta-prep` from 24 to 27 September were red and meant nothing.
No job started. Each ended in two seconds with no runner and the annotation "The job was not
started because recent account payments have failed or your spending limit needs to be increased".
That cleared on 28 September.

## What is not ready, and who holds it

| | What is missing | Who |
|---|---|---|
| Monitoring | Sentry (EU) is set up with email alerts, and has checked `/api/health` every minute since 19 September. Errors from `app.doovor.com` start arriving when M6 is merged and deployed | Engineering, on approval |
| Backups | The project is on the free plan, which keeps no backup that can be restored (checked 18 September): there is nothing to go back to. The product owner's decision: stay free until the first real user, then upgrade this project to Pro, clear the demo data and run the restore drill (D-154) | Product owner |
| Legal | Five pages written as drafts, with twelve gaps marked for a solicitor. Not in force until one has been through them | Product owner and a solicitor |
| Payments in live mode | Stripe is proved in test mode. Live mode needs the platform questionnaire answered and a hosted webhook | Product owner |
| Google sign in | The client is made and Supabase has it (18 September). The button stays off until the consent screen is published and the Vercel switch is set | Product owner |
| Leaked password check | Supabase can refuse a password known to be breached. The switch is off, and Supabase offers it only on the Pro plan | Product owner |
| Deploy, rollback, restore | Each is written down step by step; none has been rehearsed on the real project | Product owner |

## Risks worth naming

- **Outages are watched; errors are one merge away.** An outage emails within two minutes (19
  September). Errors report to Sentry once M6 is on `main`: until then an error that does not take
  the site down is noticed by whoever meets it.
- **There is no backup.** The free plan keeps none that can be restored, and a backup nobody has
  restored is a hope, not a plan: Pro first, then the drill.
- **The legal pages are drafts.** They say so on every page, but they are what a beta instructor
  will read.
- **Twenty instructors is not twenty thousand.** The load tests run against one machine's database
  with a seeded diary. They say the queries are not the problem; they do not say what a busy
  Sunday in five cities looks like.
- **No disabled person has used it.** Every screen passes an automatic scan, the keyboard reaches
  everything and text doubles without breaking a layout. That is not the same as somebody using it
  with a screen reader all week, which is worth buying before a wider launch.
- **The clocks change on 25 October 2026.** Recurring lessons keep their London time across it
  (acceptance-09), which is tested, but the first Sunday after a clock change is worth watching.

## What to do in the beta

1. Set the four owner items above, in that order: monitoring first, because everything else is
   easier to fix when you hear about it.
2. Run the production deploy checklist (RUNBOOK) for the first deploy, and treat it as the rehearsal
   for the rollback.
3. Watch the first week's audit log, Sentry issues and the Inngest job runs daily.
4. Ask each beta instructor the same three questions after their first week: what took longer than
   it should, what did you not trust, and what did you do outside the app.
5. Keep a P1 list. A P1 stops other work (RUNBOOK).
