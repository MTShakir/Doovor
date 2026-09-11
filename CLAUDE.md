# CLAUDE.md

Project guide for every coding session. Read this first, then `docs/ARCHITECTURE.md`, `docs/PLAN.md` and `docs/PROGRESS.md`.

The product requirements live in `docs/DrivingHub_PRD.md`. Every feature must trace to a PRD ID (for example `BOK-07`, `PAY-04`, `R-02`). The PRD wins on product behaviour. The engineering brief (Section 10 rules below) wins on technical choices.

## Stack (pinned in the lockfile)

| Layer | Choice |
|---|---|
| Runtime | Node 24 LTS (`.nvmrc`), pnpm 12 (`packageManager` field), Turborepo 2 |
| Web | Next.js 16 App Router, React 19, TypeScript 6.0 strict (not 7, see D-003) |
| Styling | Tailwind CSS 4 (CSS-first `@theme`), shadcn/ui restyled, Lucide icons, Inter via `next/font` |
| Forms | React Hook Form + Zod 4. Schemas live in `packages/core` and are shared by client and server |
| Data | Server Components for reads, Server Actions or Route Handlers for writes, TanStack Query for live client data |
| Database | Supabase Postgres (London), SQL migrations via Supabase CLI, generated types, RLS on every tenant table |
| Auth | Supabase Auth: email and password, magic link, Google, Apple, phone OTP, TOTP MFA |
| Jobs | Inngest |
| Payments | Stripe Connect Express, Payment Element, webhooks, behind `PaymentsProvider` |
| Messaging | Resend + React Email (`EmailProvider`), Twilio (`SmsProvider`), Web Push (VAPID) |
| PWA | Serwist (`@serwist/turbopack`), Dexie (IndexedDB) |
| Maps | Mapbox GL JS (`MapProvider`), postcodes.io (`GeoProvider`) with `postcodes` cache table |
| Dates | Store UTC. `date-fns` + `@date-fns/tz`, default zone `Europe/London` |
| Tests | Vitest, pgTAP (`supabase test db`), Playwright (390 and 1440 px), axe |
| Ops | Vercel (region `lhr1`), Sentry (EU), PostHog EU (consent-gated), GitHub Actions |

## Repository layout

```
apps/web            Next.js app: marketing, learner, instructor, school, admin portals, API routes
packages/config     brand.ts, feature flags, plan entitlements, shared tsconfig and eslint
packages/core       Pure domain logic and Zod schemas. Zero framework imports
packages/db         Typed query helpers, generated types, seed scripts
packages/ui         Design system components and tokens
packages/emails     React Email templates
packages/providers  Payments, SMS, Email, Map, Geo, Push provider interfaces and implementations
supabase/           config.toml, migrations/, tests/ (pgTAP), seed.sql
docs/               PRD, ARCHITECTURE, PLAN, PROGRESS, DECISIONS, RUNBOOK
e2e/                Playwright specs, fixtures and screenshots
```

Workspace packages use the neutral scope `@repo/*` (for example `@repo/core`) so the brand never appears in code.

## Commands

Run from the repo root.

| Command | What it does |
|---|---|
| `pnpm install` | Install dependencies |
| `pnpm dev` | Start the web app and the Inngest dev server |
| `pnpm db:start` / `pnpm db:stop` | Start or stop the local Supabase stack (Docker required) |
| `pnpm db:reset` | Re-apply all migrations and seed data locally |
| `pnpm db:migration <name>` | Create a new SQL migration |
| `pnpm db:types` | Regenerate `packages/db/src/types.gen.ts` from the local database |
| `pnpm db:test` | Run pgTAP tests (RLS, constraints, RPCs) |
| `pnpm lint` | ESLint across the monorepo, plus copy guards (brand name, dashes) |
| `pnpm typecheck` | TypeScript across the monorepo |
| `pnpm test` | Vitest unit and integration tests |
| `pnpm test:e2e` | Playwright at 390 px and 1440 px |
| `pnpm check` | lint + typecheck + test. Must be green before every commit |

## Working loop

1. Pick the next task from `docs/PLAN.md`. Plan briefly.
2. Write the test first where logic matters (core rules, RPCs, RLS).
3. Implement. Run `pnpm check`. Fix until green. Never leave the build red.
4. For UI work, run the app and click through it with Playwright at 390 px and 1440 px. Look at the screenshots. Fix what looks wrong.
5. Commit one logical change with a conventional commit that names the PRD ID, for example `feat(booking): enforce buffer overlap BOK-07`.
6. Update `docs/PROGRESS.md`. Log any decision made without the product owner in `docs/DECISIONS.md` (date, decision, options, reason).

Branch per milestone (`m0-foundation`, `m1-instructor-core`, ...). Merge to `main` only when the milestone meets its Definition of Done. At the end of each milestone, stop and deliver the milestone report, then wait for "Approved, continue".

Ask the product owner only for things only they can provide: keys, account access, legal or pricing choices, or a real PRD conflict. Batch questions. Otherwise pick the simplest option consistent with the PRD, log it, and keep moving.

## Non-negotiable rules

1. Never hold learner money in a platform wallet. Credit is always a prepaid package with one Business (PAY-12).
2. Never automate, scrape or book anything on DVSA systems. Only the learner books their test.
3. Never store money as floats. Integer pence only, in the database and in TypeScript.
4. Never disable RLS or query tenant data with the service role on behalf of a user.
5. Never expose instructor private notes, learner dates of birth or encrypted fields to the wrong role.
6. Never show a pass rate below the PRD threshold (R-17: 10 recorded tests in 12 months).
7. Never ship fake, seeded or incentivised reviews to production.
8. Never hard-code the brand name outside `packages/config/src/brand.ts`. The same applies to the domain, support email and colours.
9. Never use em dashes or en dashes in user-facing copy (UI, email, SMS).
10. Never mark a milestone done with failing or skipped tests. Never skip, delete or weaken a failing test to get green. Fix the cause.
11. Never add a feature that is not in the PRD without logging it in `docs/DECISIONS.md` and flagging it in the milestone report.

## Engineering conventions

### Database and security
- Migrations in `supabase/migrations` are the single source of truth. Once a migration is merged to `main` or applied to a shared database it is frozen: fix mistakes with a follow-up migration. Uncommitted migrations on a branch may still be edited.
- Every table in `public` has RLS enabled. A pgTAP test fails the build if any table lacks RLS or a tenant table lacks policies.
- Tenant tables carry `business_id`. Policies use helpers in the `private` schema: `private.auth_is_member(business_id)`, `private.auth_has_role(business_id, role)`, `private.auth_business_ids()`. Wrap `auth.uid()` as `(select auth.uid())` in policies.
- Booking, credit, payment, membership, verification and refund writes go only through `SECURITY DEFINER` RPCs with `set search_path = ''`. They derive the actor from `auth.uid()`, check permissions explicitly, run in one transaction and write audit rows. The `authenticated` role has no direct write grant on those tables.
- Views are `security_invoker = true`. Private notes live in their own table with no learner policy.
- The secret (service role) key is used only by the Stripe webhook handler, Inngest jobs and seed scripts, and only to call `system_*` RPCs. Server Actions always use the user's session client.
- IDs are UUIDs. Timestamps are `timestamptz` in UTC. Money columns are `integer` pence named `*_pence`.

### TypeScript and code
- Strict mode, no `any`, no non-null assertions without a comment explaining why.
- `packages/core` must not import React, Next.js, Supabase or Node-only modules. It must run in a future Expo app.
- Server-only modules import `server-only`. Secrets never use the `NEXT_PUBLIC_` prefix.
- Validate every Server Action and Route Handler input with the shared Zod schema. Return typed results (`{ ok: true, data } | { ok: false, code, message }`), never throw raw database errors to the client.
- Domain error codes (for example `SLOT_TAKEN`, `TOO_CLOSE`) are defined in `packages/core/src/errors.ts`. The UI maps codes to copy.
- Format money with `formatPence` and dates with the helpers in `packages/core/src/time`. Never format by hand.

### UI and copy
- Tokens come from `packages/config/src/brand.ts` via the generated Tailwind theme. Never use raw hex values in components.
- One primary action per screen: a black pill button, full width on mobile. Touch targets at least 48 px.
- Bottom sheets on mobile, side panels on desktop. Skeletons, not spinners. Toasts with a 5 second undo for destructive actions.
- Plain British English, sentence case, verbs on buttons. Prices `£42` or `£42.50`. Dates `Tue 15 Sep`. Times `14:30`.
- Contrast rules (see D-009): placeholders use grey-700, never grey-400. Green, yellow and red are never used as small text on grey-100. Yellow always carries black text.
- Every new component appears on the `/design` page with all its states.

### Testing
- Unit tests for everything in `packages/core`. Coverage gate: 90% lines.
- pgTAP tests for every RLS policy, constraint and RPC, including failure paths.
- Integration tests for every Server Action and Route Handler, including failure paths.
- Playwright specs for the PRD section 10 flows, run at 390 px and 1440 px, with axe checks.
- The 12 PRD acceptance tests (section 17.2) each have a named automated test: `acceptance-01` to `acceptance-12`.
