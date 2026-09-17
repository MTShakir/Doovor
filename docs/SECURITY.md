# Security review

The OWASP Top 10 (2021), item by item, against this codebase (NFR-SEC-03, M6-01). Each item says what was
checked, what proves it, and anything found. Findings are fixed here or carried to the task that owns them.

Reviewed on 17 September 2026, at commit `b13cedd`, by reading the code and its tests rather than by
scanning: the automated checks named below run on every push (`.github/workflows/ci.yml`).

## What proves each claim

| Evidence | Where |
|---|---|
| Row-level security on every table, a policy on every table, no anonymous writes, views running as the caller, `security definer` functions pinning their search path, and no anonymous function outside an allowlist | `supabase/tests/00_security_meta_test.sql` |
| Another Business's learner is not found through any API, over HTTP, with real sessions | `e2e/specs/cross-tenant.spec.ts` (acceptance-07), `supabase/tests/91_another_business_learner_test.sql` |
| A manager sees no payouts or billing, down to the column | `e2e/specs/payments.spec.ts` (acceptance-11), `supabase/tests/83_owner_money_test.sql` |
| A signed-out session stops working at once | `supabase/tests/07_session_revocation_test.sql` (D-041) |
| Viewing as somebody writes nothing, whatever screen it comes from | `supabase/tests/89_view_as_test.sql` (D-129) |
| Every sensitive action is recorded, and only staff read the log | `supabase/tests/90_audit_viewer_test.sql`, `packages/db/src/audit-actions.test.ts` (NFR-SEC-06) |
| Accessibility and copy checks, and no serious axe issues on any screen | every Playwright spec, `pnpm lint` |

## A01 Broken access control

- Tenant data is reached only through row-level security and `security definer` functions that derive the
  actor from `auth.uid()`; the `authenticated` role has no write grant on booking, credit, payment,
  membership, verification or refund tables. The meta test fails the build if a table loses its policies.
- Reading another Business's learner by id answers not found everywhere, including the app's own API
  (D-131). Writes that name a learner refuse the same way for an id that belongs to nobody.
- Payout and billing columns are refused by column privilege, not by hiding a panel (D-123).
- The admin portal needs platform staff past their second step; suspending a Business or an account needs a
  super admin (D-125, D-126). Viewing as somebody runs as that person in a read-only transaction (D-129).
- A suspended Business takes no bookings and no card payments; a suspended account cannot sign in at all.
- **Finding, fixed:** the levers under `/dev` (run the jobs, charge lessons the day before, finish a fake
  payments account, expire the public pages) refused only in production, so they answered on staging with
  nobody signed in. They now answer on a developer's machine and in the test runs only (`devRoutesOpen`,
  D-135).

## A02 Cryptographic failures

- HTTPS everywhere, with `Strict-Transport-Security` including subdomains and preload.
- Passwords are Supabase Auth's (bcrypt, never ours to store). Learner licence numbers are encrypted in
  their own column, with the keys required in production (`FIELD_ENCRYPTION_KEYS`).
- Invitations keep a hash of the token, never the token (D-064, D-118).
- **Known and accepted:** the session cookie is readable by the page's own scripts. That is how
  `@supabase/ssr` works, because the browser client reads the session from it; it is `sameSite=lax`, path
  limited and short-lived, and signing out ends it everywhere (D-041). What keeps it safe is that no
  screen renders anybody's HTML, React escapes what it draws, and M6-04 enforces the content security
  policy. The viewing marker is the only cookie we set ourselves: it holds an id, no claim, and is
  `sameSite=strict` (D-129).
- The secret key never reaches the browser: secrets carry no `NEXT_PUBLIC_` prefix, and the one module that
  can use it creates or deletes an identity and touches no tenant table (D-068).
- **Outstanding, product owner:** leaked password protection is one switch in the Supabase dashboard
  (RUNBOOK 3.1 step 4).

## A03 Injection

- Every database call goes through supabase-js or postgres.js with parameters; no migration builds SQL as
  text (`execute format` appears nowhere), and every `security definer` function pins `search_path`.
- React escapes what it renders. The two places that write raw HTML are the brand's own stylesheet, built
  from `brand.ts`, and the structured data script, which escapes anything that could end it (M5-04).
- Emails are rendered from React Email templates, so the words are escaped in the same way.
- Postcodes, searches and filters are validated against a Zod schema before they reach the database, and
  the searches use `ilike` with an escaped pattern (`private.contains_pattern`).

## A04 Insecure design

- Money is integer pence, in the database and in TypeScript. A learner's credit is a prepaid package with
  one Business and never a platform wallet (PAY-12).
- Two learners cannot take the same slot: the exclusion constraint decides, not the app (acceptance-02).
- A payment delivered three times is one payment and one credit entry (acceptance-06); a lesson record
  saved twice is one record (M4-02).
- The audit log is append-only, enforced by a trigger, and staff read it through a function.
- Rate limits sit in the database, where the API cannot be used to step around them (D-117); M6-03 confirms
  them on the auth, booking and invitation paths.

## A05 Security misconfiguration

- Security headers on every response: HSTS, `X-Content-Type-Options`, `X-Frame-Options: DENY`, a strict
  referrer policy, a narrow permissions policy, and a content security policy.
- Outside production nothing is indexed, and private areas are never indexed (D-047).
- The Supabase advisor on staging shows no errors; its warnings are the expected `security definer`
  pattern (D-051) and the leaked password switch above.
- Server action arguments are never logged, since they include passwords and codes (D-036).
- Browser source maps are not published (Next's default), and the app sends no `X-Powered-By`.
- **Carried to M6-04:** the content security policy is report-only until every third-party origin is
  confirmed; M6-04 enforces it and proves no violations in the end to end runs.
- **Accepted:** the `/design` page answers on staging. It is a gallery of components with no data of
  anybody's, and it is not indexed. It is not there in production.

## A06 Vulnerable and outdated components

- Versions are pinned by the lockfile, and the stack is the one CLAUDE.md names.
- `pnpm audit` on 17 September 2026: 5 high, 1 moderate, 1 low, every one of them in a development or
  build-time tool (Lighthouse CI's own tree, and a build-time `browserslist` under Serwist). None is in
  anything the app serves.
- **Carried to M6-02:** raise those versions with lockfile overrides, and set up the update policy.

## A07 Identification and authentication failures

- Platform staff and Business owners must pass a second step (TOTP) before their portal opens (AUTH-08),
  and a staff member without it reads nothing, which pgTAP proves function by function.
- Signing out ends the session for every device it was on: the request check refuses a session that has
  been revoked, rather than waiting for the token to expire (D-041).
- Resetting somebody's two step verification is a super admin's act, recorded in the audit log (D-126).
- Suspending an account bans it in Auth itself, so every way of signing in refuses, and deletes its
  sessions at once (D-126).
- Invitation links work once, expire, and say whose they are; a link opened by an account that already
  teaches elsewhere is refused with what to do instead (D-118).
- Sign-in says "Email or password is not right" either way, so it cannot be used to test whether an
  address has an account.
- **Known and accepted:** signing up with a mobile that already belongs to an account says so, which is
  what lets somebody fix a typo, and it does tell a caller that the number is in use. The control is the
  rate limit on sign-up and on codes; email addresses say nothing either way.

## A08 Software and data integrity failures

- Stripe webhooks are verified against the signing secret before anything is read from them, and an event
  delivered again changes nothing (acceptance-06).
- The jobs endpoint answers only Inngest: without the signing key it answers 401 (RUNBOOK 3.8 step 5).
- **Finding, fixed:** the signing key was required in production only, so a hosted environment could in
  principle have run without it. Any hosted environment now requires it (`APP_ENV is hosted`, D-135).
- The service worker is served from the app's own origin at the root, and the app's own build files are the
  only ones it keeps.
- CI builds from the lockfile (`--frozen-lockfile`) and runs the same checks on every push.

## A09 Security logging and monitoring failures

- Every action NFR-SEC-06 names is recorded with who did it, in what role, and whom it was about:
  sign-ins, role changes, verification decisions, refunds, payout and payment changes, data exports,
  account deletions and viewing as somebody. Staff read them by kind, person, Business and day (D-130).
- A test reads the migrations and fails if an action is recorded that the viewer cannot put into words.
- Reading the log is not itself recorded, and nothing sensitive is written into log messages (D-036).
- **Carried to M6-10:** Sentry on the client, the server and the jobs, uptime checks and alert routing.

## A10 Server-side request forgery

- The server fetches from two places it chooses itself: postcodes.io for a postcode, and Mapbox for a
  static map image, both at addresses built in code.
- **Finding, fixed:** the share image drawer fetched the photo address it was given. The address is always
  built from our own storage, but an instructor can write their own photo path, so the drawer now fetches
  only a stored picture of ours or a picture carried in the address itself, and never follows a redirect
  (`isDrawablePhotoUrl`, D-135).
- Nothing else takes an address from anybody: there are no webhooks out, no URL previews and no imports
  from a link.
