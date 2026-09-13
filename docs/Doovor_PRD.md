# Doovor Product Requirements Document

Version 1.0 | 10 September 2026 | Owner: Talha, Maxterz LTD | Status: Approved for build

Doovor is a working name. The final brand name is set in one configuration file so a rename takes minutes.

## 1. Executive summary

Doovor is the one place in the UK where learners, driving instructors and driving schools meet, book, pay and track progress.

It works like Uber for driving lessons. Learners open the app, enter a postcode and see instructors who have space. Instructors run their whole business from their phone. Driving schools manage their team, learners and money in one dashboard.

We launch as a free, simple business tool for instructors and schools. Every instructor who joins gets a public profile and a booking link from day one. Once an area has enough instructors with open capacity, we switch on the learner marketplace for that area. Supply comes first. The marketplace grows on top of it.

**One line:** Everything a driving instructor needs to run their business, and everything a learner needs to pass, in one simple app.

**Core bet:** The UK does not have too few learners. It has too few instructors with visible, bookable availability. The winner is the platform that makes every instructor's free slot visible, bookable and paid.

## 2. The problem

### 2.1 Learners

- They cannot find an instructor who has space. Many instructors have waiting lists or no availability at all.
- Prices, reviews and availability are scattered across Google, Facebook and word of mouth.
- Progress lives in the instructor's head or on paper. When a learner switches instructor, their record is lost.
- Since 12 May 2026, only the learner can book, change, swap or cancel their car driving test. Many learners feel lost managing this alone.

### 2.2 Independent instructors

- They run the business on WhatsApp, phone calls, paper diaries and spreadsheets.
- Cash and bank transfers are hard to track. Late cancellations and no-shows cost them money.
- Waiting lists live in notebooks. When a lesson is cancelled, the slot goes empty.
- Making Tax Digital for Income Tax now applies to sole traders over £50,000 (from April 2026). The threshold drops to £30,000 in April 2027 and £20,000 in April 2028. Most full-time instructors will need digital records.

### 2.3 Driving schools

- They juggle instructor allocation, learner allocation, fleet, payments and reporting across separate tools.
- They have poor visibility of instructor utilisation, revenue and learner outcomes.

### 2.4 Market signals (researched September 2026)

| Signal | Detail |
|---|---|
| Instructor capacity crisis | 56.4% of instructors keep waiting lists; 63.4% report no availability; over 70% in Scotland, North East and North West have none. ADI numbers grew 3.46% last year. |
| DVSA booking rule change | From 12 May 2026 only the learner can book, change, swap or cancel a car test. Learners get two permitted changes. |
| Making Tax Digital | MTD for Income Tax: over £50k from April 2026, over £30k from April 2027, over £20k from April 2028. Quarterly digital updates. |
| Price pressure | Tools range from free (PassReady, DriveSchoolPro until March 2027) to about £26 per month (Total Drive). Instructors expect the core to be free or cheap. |

## 3. Competitive landscape and positioning

| Competitor | Model | Strength | Gap we exploit |
|---|---|---|---|
| LANE (joinlane.app) | Marketplace, free to join, per-lesson fee capped at £1 above the instructor rate. Launching October 2026. | Strong marketing, founder incentives, marketplace-first. | Marketplace-first faces the empty-supply problem. Lighter business tools. No school operations. |
| Instruct Me (PassMeFast / CAPSIL) | Marketplace, live in Cheshire, UK-wide rollout planned. | Backed by a large lesson reseller with learner demand. | Seen by instructors as a lead reseller. Trust gap with ADIs. |
| PassReady | Free for instructors, pupil pays 4.2% plus round-up booking fee. | Free tool, DVSA tracking, MTD records. | Fee on every lesson charged to learners. No schools. |
| Total Drive | £18 to £26 per month. | Mature diary and pupil records. | Dated UX. Online booking locked to higher tiers. |
| MyDriveTime | £19 per month. | Diary, progress, finance, journey tracking. | Paid only. No marketplace. |
| GoRoadie Pro | £15 per month plus paid pupil referrals. | Payments and tax exports. | Charges per referred pupil. |
| DriveInstruct, DriveSchoolPro, DriveView | Low-cost or free early-stage tools. | Low price. | Early products, unclear roadmaps. |

### 3.1 Our positioning

We are not another diary app and not another lead reseller. We are the operating system for driving lessons, with a marketplace built in.

Five differentiators we build into the product from day one:

1. **Uber-grade simplicity.** One primary action per screen. Book a lesson in under 30 seconds. Set up an instructor account in under 5 minutes.
2. **Gap Fill.** When a lesson is cancelled, the slot goes to the instructor's own waiting list first, then to nearby matched learners. The first to accept books and pays. Empty slots become paid lessons.
3. **Driving Passport.** A learner-owned progress record aligned to the DVSA test report (DL25) skill areas. It follows the learner if they change instructor, with their consent.
4. **Built for the 2026 rules.** Learner-owned test tracking that fits the DVSA May 2026 change, plus MTD-ready income and expense records for instructors.
5. **Schools and independents on one network.** One product serves a solo ADI, a 50-instructor school and a franchise, so the network covers the whole market.

## 4. Product strategy and phases

Principle: build the infrastructure first, then turn it into a marketplace.

| Phase | Name | Goal | Key output |
|---|---|---|---|
| 1 | Instructor OS (MVP) | Get instructors and small schools running their business on Doovor. | Accounts, instructor profile and verification, diary, bookings, learner CRM, lesson records, progress, payments (online and offline), reminders, public profile and booking link, basic school portal, super admin. |
| 2 | Network and Schools | Deepen school tools and grow the network. | Full school portal, waiting lists, Gap Fill, messaging, reviews, subscriptions, MTD exports, test tracking, analytics. |
| 3 | Learner Marketplace | Switch on learner search and booking by region. | Map search, filters, compare, instant booking, lesson requests, marketplace fees, featured listings. |
| 4 | Intelligence | Use data to match, schedule and predict. | AI instructor matching, smart scheduling with travel time, test readiness score, AI lesson summaries. |
| 5 | Ecosystem and scale | Expand services and markets. | Native apps, multi-branch schools, fleet, partner offers (insurance, cars, theory), API, white label, Ireland then other markets. |

### 4.1 SaaS first, marketplace ready

Phase 1 ships the business tool, but every data structure is marketplace-ready:

- Every instructor has a public profile page with a clean URL (for example `/instructors/london/sarah-khan`) and a shareable booking link from day one. Instructors share it on WhatsApp, Instagram and Google Business. This gives them value and gives us SEO pages.
- Location, coverage, prices, availability and verification are captured in Phase 1 in the same shape the marketplace needs.
- A feature flag `marketplace_enabled` exists per region (postcode area, for example `M`, `LS`, `SW`).

### 4.2 Regional switch-on rule

The learner marketplace opens in a postcode area when both are true (values are configurable by Super Admin):

- At least 25 verified instructors cover the area.
- Those instructors show at least 150 open bookable lesson hours across the next 14 days.

Before switch-on, learners in that area can join a waiting list and post a lesson request. This builds demand data and feeds Gap Fill.

## 5. Goals and success metrics

**North Star metric:** Lessons completed through Doovor per week.

| Area | Metric | Phase 1 target (first 6 months after launch) |
|---|---|---|
| Acquisition | Instructors signed up | 1,000 |
| Activation | Instructor adds at least 3 learners and 5 lessons within 7 days | 50% of sign-ups |
| Engagement | Weekly active instructors | 60% of activated instructors |
| Payments | Share of lessons paid through Doovor (online or recorded offline) | 70% |
| Learner adoption | Learners who accept an invite and log in | 60% |
| Quality | Instructor NPS | 50 or higher |
| Reliability | Double bookings in production | Zero |

## 6. Users and roles

| Role | Who | Access scope |
|---|---|---|
| Super Admin | Doovor founders | Whole platform. |
| Support Admin | Doovor support staff | Read most data, manage verification, disputes and reviews. No payouts or platform settings. |
| School Owner | Owner of a driving school | Everything in their school, including billing and payouts. |
| School Manager | Office staff at a school | Instructors, learners, bookings, reports. No billing or payouts. |
| Instructor (independent) | Solo ADI or PDI running their own business | Their own business: profile, diary, learners, payments, earnings. |
| Instructor (school) | ADI or PDI working under a school | Their own diary and assigned learners. Money visibility set by school. |
| Learner | Person learning to drive | Their own profile, bookings, payments, progress, Passport. |
| Payer (guardian) | Parent or sponsor who pays for a learner | Pay, view bookings and receipts for linked learners. Progress only if the learner allows. |

### 6.1 Account model

- One global identity per person (email or phone). One person can hold several roles (for example an instructor who is also a school owner).
- A **Business** is the tenant. An independent instructor is a Business of one. A school is a Business with many instructors.
- A learner is a global user. They can be linked to one or more Businesses through a learner relationship record. This lets a learner change instructor and keep their Passport.
- Strict data isolation: a Business can see only its own instructors, learners, bookings and money.

### 6.2 Permission matrix (summary)

| Capability | Super | Support | School Owner | School Manager | Instructor (indep.) | Instructor (school) | Learner | Payer |
|---|---|---|---|---|---|---|---|---|
| Manage platform settings and regions | Yes | No | No | No | No | No | No | No |
| Verify instructors | Yes | Yes | No | No | No | No | No | No |
| Manage business profile | Yes | No | Yes | Yes | Yes | No | No | No |
| Add and remove instructors | Yes | No | Yes | Yes | No | No | No | No |
| Manage own availability | No | No | Yes | Yes | Yes | Yes | No | No |
| Create and edit bookings | Yes | Yes | Yes | Yes | Yes | Own learners | Own | For linked learners |
| Write lesson records | No | No | No | No | Yes | Yes | No | No |
| View learner progress | Yes | Yes | Yes | Yes | Own learners | Own learners | Own | If allowed |
| Set prices and packages | No | No | Yes | Yes | Yes | If school allows | No | No |
| View business revenue | Yes | Yes | Yes | If allowed | Yes | Own earnings | No | No |
| Manage payouts and billing | Yes | No | Yes | No | Yes | No | No | No |
| Issue refunds | Yes | Yes | Yes | Yes | Yes | No | No | No |
| Moderate reviews | Yes | Yes | No | No | Reply only | Reply only | Write | No |

## 7. Design principles and design system

The product takes its cues from Uber: calm, monochrome, fast and obvious. A new user should never need a tutorial.

### 7.1 Principles

1. **One screen, one job.** Each screen has one clear primary action in a full-width black button.
2. **Show, do not explain.** Icons, maps, times and prices do the talking. Keep copy short.
3. **Thumb first.** Design for a phone held in one hand. Primary actions sit in the bottom third. Touch targets are at least 48 by 48 pixels.
4. **Bottom sheets over new pages.** Details, filters and confirmations open in bottom sheets on mobile and side panels on desktop.
5. **Instant feedback.** Optimistic updates, skeleton loaders, no blank screens. Every action confirms in under 1 second.
6. **Progressive disclosure.** Show the minimum. Advanced settings sit behind "More options".
7. **Forgiving.** Undo for 5 seconds after destructive actions. Clear errors that say what to do next.

### 7.2 Colour

Black and white carry 95% of the interface. Yellow highlights. Red and blue appear only where meaning demands them.

| Token | Hex | Use |
|---|---|---|
| `black` | #000000 | Primary buttons, headings, active tab, map pins |
| `ink` | #1A1A1A | Body text on white |
| `grey-700` | #545454 | Secondary text |
| `grey-400` | #AFAFAF | Placeholder text, disabled |
| `grey-200` | #E2E2E2 | Borders, dividers |
| `grey-100` | #F3F3F3 | Input fills, card backgrounds, chips |
| `white` | #FFFFFF | Page background |
| `yellow` | #FFD400 | Highlights only: selected slot, "Available today" badge, Gap Fill offers, key stats. Always with black text. Never as body text on white. |
| `red` | #E11900 | Errors, destructive actions, overdue payments only |
| `blue` | #276EF1 | Links in long text and the "Verified" tick only |
| `green` | #05A357 | Success confirmations and "Paid" status only |

Dark mode inverts black and white and keeps yellow. Ship light mode first; build tokens so dark mode is a switch.

### 7.3 Typography

- Font: Inter (free, close to Uber Move). Fallback: system UI stack.
- Scale: Display 36/40 bold, H1 28/34 bold, H2 22/28 semibold, H3 18/24 semibold, Body 16/24 regular, Small 14/20, Caption 12/16.
- Numbers (prices, times) use tabular figures.
- Sentence case everywhere. No full capitals except short badges.

### 7.4 Layout and components

- 8-point spacing grid. Corner radius 12 pixels for cards and sheets, 8 for inputs, full pill for chips and primary buttons.
- Components: Button (primary black, secondary grey-100, tertiary text), Input, Search bar with postcode, Chip filter, Bottom sheet, Card, List row with chevron, Avatar with Verified tick, Time slot grid, Calendar (day, week, month), Map with pins and radius circle, Stepper, Toast, Empty state, Skeleton, Status pill, Rating stars, Progress ring, Skill bar (1 to 5).
- Status pills: Confirmed (black), Pending (grey), Completed (green), Cancelled (grey, struck through), Unpaid (red outline), Gap Fill offer (yellow).
- Icons: Lucide, 24 pixel, 1.5 stroke.
- Motion: 200 millisecond ease-out for sheets and toasts. Respect reduced motion settings.

### 7.5 Signature screens (Uber-inspired)

- **Learner home:** Full-bleed map of the learner's area with instructor pins. A white search card at the top reads "Where do you want lessons?" with the postcode pre-filled. A row of quick chips below: Manual, Automatic, Available this week, Under £40. A bottom sheet lists instructors sorted by best match.
- **Instructor home ("Today"):** A vertical timeline of today's lessons. Each card shows time, learner name, pickup point, paid status and a "Navigate" button. A big black button at the bottom: "Start lesson" for the next lesson.
- **Booking confirmation:** A full screen with a large tick, lesson time, instructor photo, pickup point and "Add to calendar".
- **Lesson in progress:** A simple screen with a timer, learner name, and a skills checklist the instructor taps during or after the lesson.

### 7.6 Content style

- Plain British English. Short sentences. Active voice. No jargon.
- Button labels are verbs: "Book lesson", "Add learner", "Get paid".
- Money shown as £42.00 or £42 for whole pounds. Dates as "Tue 15 Sep". Times as 14:30.

## 8. Platform and information architecture

### 8.1 Surfaces

- **Web app + PWA:** One responsive Next.js app. Installable on iOS and Android home screens. Works offline for the instructor's today view and lesson records, and syncs when back online.
- **Marketing site:** Same codebase. Public pages for SEO.
- **Native apps:** Phase 5. The API layer and shared packages are built so an Expo React Native app can reuse them.

### 8.2 Navigation

| Portal | Mobile bottom tabs | Desktop sidebar |
|---|---|---|
| Learner | Home (map/search), Lessons, Progress, Account | Same plus Payments |
| Instructor | Today, Diary, Learners, Money, More | Today, Diary, Learners, Money, Waiting list, Profile, Settings |
| School | Overview, Diary, Instructors, Learners, More | Overview, Diary, Instructors, Learners, Money, Fleet, Reports, Settings |
| Super Admin | Desktop only | Dashboard, Businesses, Instructors, Verification, Learners, Bookings, Payments, Reviews, Disputes, Regions, Plans, Content, Settings, Audit log |

### 8.3 Public URL structure (SEO)

| Page | URL pattern | Example |
|---|---|---|
| Home | `/` | |
| Learner landing | `/learners` | |
| Instructor landing | `/instructors-software` | |
| School landing | `/driving-schools-software` | |
| Pricing | `/pricing` | |
| City hub | `/driving-lessons/{city}` | `/driving-lessons/manchester` |
| Area page | `/driving-lessons/{city}/{area}` | `/driving-lessons/london/croydon` |
| Transmission page | `/driving-lessons/{city}/automatic` | |
| Instructor profile | `/instructors/{city}/{slug}` | `/instructors/leeds/sarah-khan` |
| School profile | `/schools/{city}/{slug}` | `/schools/bristol/greenlight-driving` |
| Booking link | `/book/{slug}` | `/book/sarah-khan` |
| Guides | `/guides/{topic}` | `/guides/how-to-book-driving-test` |

Only areas with at least 3 verified instructors get an indexable area page. Thin pages carry `noindex` until they qualify.

## 9. Functional requirements

Priority key: **P1** = Phase 1 (MVP), **P2** = Phase 2, **P3** = Phase 3, **P4** = Phase 4, **P5** = Phase 5. Each requirement has an ID so the build and tests can reference it.

### 9.1 Accounts, sign-up and onboarding

| ID | Requirement | Phase |
|---|---|---|
| AUTH-01 | Sign up and log in with email and password, email magic link, Google and Apple. | P1 |
| AUTH-02 | Phone number capture with SMS one-time code verification for instructors. Learners verify email; phone optional. | P1 |
| AUTH-03 | Role choice on first screen: "I'm learning to drive", "I'm an instructor", "I run a driving school". | P1 |
| AUTH-04 | Instructor onboarding in 5 steps, each one screen: name and photo, ADI or PDI number, postcode and radius, prices, weekly hours. Skip allowed on all but name. Progress bar at top. | P1 |
| AUTH-05 | School onboarding: school name, logo, main postcode, number of instructors, invite instructors by email or phone. | P1 |
| AUTH-06 | Learner onboarding: name, postcode, manual or automatic, experience level (none, some, test booked). Date of birth to confirm age 16 or over. | P1 |
| AUTH-07 | Invite links: an instructor invites a learner by SMS, WhatsApp share or email. The learner lands on a pre-filled sign-up linked to that instructor. | P1 |
| AUTH-08 | Two-factor authentication for Super Admin, Support Admin and School Owner. Optional for others. | P1 |
| AUTH-09 | Session management, log out on all devices, account deletion request from settings. | P1 |
| AUTH-10 | Payer (guardian) accounts linked to a learner by invite. | P2 |

### 9.2 Instructor profile and verification

| ID | Requirement | Phase |
|---|---|---|
| INS-01 | Profile fields: display name, photo, bio (300 characters), languages spoken, years teaching, ADI or PDI status, badge number, badge expiry date, car make and model, transmission (manual, automatic or both), dual controls (yes), lesson types, specialisms (nervous drivers, intensive courses, Pass Plus, motorway, refresher, test prep). | P1 |
| INS-02 | Verification: instructor uploads a photo of their ADI (green) or PDI (pink) badge and confirms DBS status. Support Admin reviews and approves. Approved profiles show a blue Verified tick. | P1 |
| INS-03 | Badge expiry tracking with reminders at 60, 30 and 7 days. Profile hides from search when expired. | P1 |
| INS-04 | PDI profiles show "Trainee instructor" clearly. Trainees must link to a supervising school or ADI. | P1 |
| INS-05 | Public profile page and booking link generated on approval (see 9.13). | P1 |
| INS-06 | Pass rate shown only when based on at least 10 recorded tests in the last 12 months, and labelled "Based on tests recorded on Doovor". | P2 |

### 9.3 Coverage area

| ID | Requirement | Phase |
|---|---|---|
| COV-01 | Instructor sets a base postcode and a radius (1 to 30 miles, default 8). A map shows the circle. | P1 |
| COV-02 | Optional exclusion or addition of postcode districts (for example add `LS17`, exclude `LS1`). | P1 |
| COV-03 | Postcode lookup and validation through postcodes.io with a local cache. Store latitude and longitude. | P1 |
| COV-04 | Pickup points: learner home, school, work, or a custom address. Stored per learner. | P1 |
| COV-05 | Test centres list (DVSA practical test centres) with location, used for test prep lessons and search filters. | P2 |

### 9.4 Availability and diary

| ID | Requirement | Phase |
|---|---|---|
| DIA-01 | Weekly working hours template (for example Mon to Fri 08:00 to 18:00). | P1 |
| DIA-02 | Add one-off open slots and block time off (holiday, personal, car service). | P1 |
| DIA-03 | Day, week and month views. Week view is default on desktop, day view on mobile. Drag to move a lesson on desktop, long-press on mobile. | P1 |
| DIA-04 | Colour and status on each lesson: paid, unpaid, credit, test day. | P1 |
| DIA-05 | Buffer time between lessons, configurable 0 to 60 minutes (default 30). | P1 |
| DIA-06 | Minimum booking notice for learner self-booking (default 24 hours) and booking horizon (default 8 weeks). | P1 |
| DIA-07 | Two-way sync with Google Calendar and Outlook, plus ICS feed export. | P2 |
| DIA-08 | Travel-time aware slot suggestions based on the previous lesson drop-off. | P4 |
| DIA-09 | School diary: all instructors side by side, filter by instructor, transmission and branch. | P1 |

### 9.5 Bookings

| ID | Requirement | Phase |
|---|---|---|
| BOK-01 | Instructor books a lesson for a learner in 3 taps: pick learner, pick slot, confirm. Duration defaults to the learner's usual length. | P1 |
| BOK-02 | Learner self-books from the instructor's booking link or in-app: pick lesson type, pick slot, confirm and pay. | P1 |
| BOK-03 | Lesson durations: 60, 90, 120 minutes plus custom set by the Business. | P1 |
| BOK-04 | Lesson types: standard, test prep, mock test, motorway, intensive block, test day (car hire for test). Each has its own price. | P1 |
| BOK-05 | Recurring lessons: weekly at the same time for N weeks or until cancelled. Each occurrence is its own booking. | P1 |
| BOK-06 | Instructor approval mode: "Instant book" or "Request to book" (instructor accepts within a set time, default 12 hours, else it expires). | P1 |
| BOK-07 | No double booking. The database rejects any overlap for the same instructor including buffers (see Rules R-01 to R-03). | P1 |
| BOK-08 | Reschedule: learner can move a lesson if outside the cancellation window; instructor can move at any time with learner notified. | P1 |
| BOK-09 | Cancel with reason. Cancellation policy applied automatically (see Rules R-06 to R-09). | P1 |
| BOK-10 | Mark lesson as completed, no-show, or cancelled. Completing opens the lesson record. | P1 |
| BOK-11 | Car assignment for school instructors (which vehicle). | P2 |
| BOK-12 | Block bookings for intensive courses (for example 5 days, 4 hours per day) with one checkout. | P2 |

### 9.6 Learner management (instructor and school CRM)

| ID | Requirement | Phase |
|---|---|---|
| LRN-01 | Learner list with search, filters (active, waiting, passed, inactive) and quick actions (call, message, book). | P1 |
| LRN-02 | Learner card: contact details, pickup points, transmission, lessons taken, hours driven, balance, next lesson, test date, notes. | P1 |
| LRN-03 | Add learner manually or by invite link. Import from CSV (name, phone, email, postcode). | P1 |
| LRN-04 | Private instructor notes per learner, never visible to the learner. | P1 |
| LRN-05 | Learner status workflow: Enquiry, Waiting, Active, Test booked, Passed, Left. | P1 |
| LRN-06 | School can assign or reassign a learner to an instructor. History stays with the learner. | P1 |
| LRN-07 | Learner transfer between Businesses with learner consent. The Passport moves; private notes do not. | P2 |

### 9.7 Lesson records and the Driving Passport

| ID | Requirement | Phase |
|---|---|---|
| PRG-01 | After each completed lesson the instructor fills a lesson record in under 60 seconds: skills covered (tap to select), rating per skill (1 to 5), short summary, focus for next lesson, optional homework. | P1 |
| PRG-02 | Skill map aligned to DVSA test report areas (see Appendix A). Rating scale: 1 Introduced, 2 Under full instruction, 3 Prompted, 4 Seldom prompted, 5 Independent. | P1 |
| PRG-03 | Learner sees a timeline of lesson records and a skill map with progress bars. | P1 |
| PRG-04 | Driving Passport: the learner's full progress record. The learner owns it and can share a read-only link with a new instructor or a parent. | P2 |
| PRG-05 | Hours driven counter (lessons plus logged private practice). Learner can log private practice with a supervising driver. | P2 |
| PRG-06 | Mock test recording with DL25-style minor, serious and dangerous faults per area. | P2 |
| PRG-07 | Test readiness indicator: rule-based score from skill ratings, mock test results and hours. Labelled as guidance, not a guarantee. | P2 |
| PRG-08 | AI lesson summary from instructor voice note, instructor approves before it is saved. | P4 |
| PRG-09 | Offline lesson record: works without signal, syncs later. | P1 |

### 9.8 Driving test tracking

| ID | Requirement | Phase |
|---|---|---|
| TST-01 | Learner adds their own test date, time, test centre and booking reference. Doovor never books tests on the learner's behalf (DVSA rule from 12 May 2026). | P2 |
| TST-02 | Learner can share test details with their instructor. The instructor sees it in the diary and can offer a test day booking (warm-up lesson plus car use). | P2 |
| TST-03 | Test result capture (pass or fail, number of minors, serious and dangerous faults). Feeds pass rate (INS-06). | P2 |
| TST-04 | Guidance screen linking to the official GOV.UK test booking service. No scraping or automated booking of DVSA systems. | P2 |

### 9.9 Payments

| ID | Requirement | Phase |
|---|---|---|
| PAY-01 | Each Business connects a Stripe Connect Express account in onboarding (2 minutes, identity handled by Stripe). Card payments go to the Business; Doovor takes an application fee where applicable. | P1 |
| PAY-02 | Learner pays by card, Apple Pay or Google Pay. Card can be saved for future lessons. | P1 |
| PAY-03 | Payment options per Business: pay at booking, pay before lesson (auto-charge saved card 24 hours before), or pay after lesson (payment link sent on completion). | P1 |
| PAY-04 | Lesson packages (for example 10 hours for £380). Purchased hours become lesson credit held against that Business only. Bookings use credit first. | P1 |
| PAY-05 | Offline payments: instructor records cash or bank transfer against a learner in 2 taps. Shows as "Paid (cash)" or "Paid (bank)". | P1 |
| PAY-06 | Learner balance per Business: credit hours, amount owed, payment history. Overdue lessons flagged in red. | P1 |
| PAY-07 | Refunds: full or partial, to card or back to credit. Always logged with reason and actor. | P1 |
| PAY-08 | Automatic receipts by email with Business name, address and lesson details. VAT shown only if the Business is VAT registered. | P1 |
| PAY-09 | Late cancellation and no-show fees charged per the Business policy (to saved card or deducted from credit). | P1 |
| PAY-10 | Payer (guardian) can pay for a linked learner. | P2 |
| PAY-11 | Gift cards for lessons. | P5 |
| PAY-12 | Doovor never holds learner money in a platform wallet. Credit is always a prepaid package with a specific Business. This avoids e-money regulation. | P1 |

### 9.10 Earnings, expenses and tax

| ID | Requirement | Phase |
|---|---|---|
| MNY-01 | Money dashboard: this week, this month, this tax year (6 April to 5 April). Paid, unpaid, credit sold, refunds. | P1 |
| MNY-02 | Expenses: fuel, car finance, insurance, servicing, franchise fee, ADI registration, training. Photo of receipt. | P2 |
| MNY-03 | Mileage log per lesson (manual entry in P2, automatic from trip in P4). | P2 |
| MNY-04 | Export income and expenses as CSV and PDF by tax year and by quarter, in a format ready for MTD software or an accountant. | P2 |
| MNY-05 | Direct MTD submission through HMRC-recognised software partner or API. | P5 |
| MNY-06 | School: revenue by instructor, instructor earnings statements, commission or franchise fee settings. | P2 |

### 9.11 Messaging and notifications

| ID | Requirement | Phase |
|---|---|---|
| NTF-01 | Notification channels: in-app, email and web push (PWA). SMS for reminders only, on Pro plan or as paid add-on. | P1 |
| NTF-02 | Automatic reminders to learners 24 hours and 2 hours before each lesson. Configurable per Business. | P1 |
| NTF-03 | Event notifications: booking made, changed, cancelled, payment received, payment failed, lesson record added, badge expiry, new review, new learner request. Full list in Appendix B. | P1 |
| NTF-04 | Users control non-essential notifications per channel in settings. | P1 |
| MSG-01 | In-app chat between learner and instructor, tied to the learner relationship. Text and images. | P2 |
| MSG-02 | Chat is logged and can be reported. Contact details are shared only after a first booking (marketplace leads) to protect both sides. | P2 |
| MSG-03 | Quick replies and templates for instructors ("Running 10 minutes late"). | P2 |

### 9.12 Waiting list and Gap Fill

| ID | Requirement | Phase |
|---|---|---|
| GAP-01 | Waiting list per Business: learner name, contact, postcode, transmission, preferred days and times, date joined. Learners can join from the public profile when the instructor is full. | P2 |
| GAP-02 | When a confirmed lesson is cancelled, the instructor chooses "Fill this slot" or it runs automatically if enabled. | P2 |
| GAP-03 | Gap Fill offer order: (1) the instructor's own active learners who opted in to short-notice lessons, (2) the instructor's waiting list, (3) nearby marketplace learners who match transmission and time (only when the marketplace is live in that region). | P2 |
| GAP-04 | Offers go out by push and SMS in waves (default 5 people at a time, 10 minutes per wave). First to accept and pay gets the slot. Others see "Slot taken". | P2 |
| GAP-05 | Instructor sees how many gaps were filled and the revenue saved. | P2 |

### 9.13 Public profile and booking link

| ID | Requirement | Phase |
|---|---|---|
| PUB-01 | Public page per instructor and school: photo, Verified tick, bio, car, transmission, areas covered map, prices, packages, reviews, next available slots, "Book" or "Join waiting list" button. | P1 |
| PUB-02 | Server-rendered, fast, with schema.org markup (LocalBusiness for schools, Person plus Service for instructors, AggregateRating when reviews exist, Offer for prices). | P1 |
| PUB-03 | Shareable booking link and QR code. Share buttons for WhatsApp, Instagram and copy link. | P1 |
| PUB-04 | Instructor can hide their profile from search while keeping the booking link. | P1 |
| PUB-05 | Embeddable "Book with me" button for instructors' own websites. | P2 |

### 9.14 Learner marketplace

| ID | Requirement | Phase |
|---|---|---|
| MKT-01 | Learner enters postcode or uses location. Results show instructors whose coverage includes that postcode. | P3 |
| MKT-02 | Map view and list view. List is a bottom sheet over the map on mobile. | P3 |
| MKT-03 | Filters: transmission, price range, available within (this week, 2 weeks, a month), gender of instructor, language, specialism, rating, lesson type, school or independent. | P3 |
| MKT-04 | Default sort "Best match": availability soon, distance, rating, response time, completion rate. Other sorts: nearest, lowest price, highest rated. | P3 |
| MKT-05 | Compare up to 3 instructors side by side. | P3 |
| MKT-06 | Instant book or request to book, depending on instructor setting. | P3 |
| MKT-07 | Lesson request (Uber-style): learner posts what they need (area, transmission, days, times, budget, start date). Matched instructors get notified and can send an offer. Learner picks one. Requests expire after 72 hours. | P3 |
| MKT-08 | First-lesson flow: learner chooses a pickup point, adds provisional licence confirmation, pays. Instructor gets full contact details after confirmation. | P3 |
| MKT-09 | Featured listings: paid placement marked "Featured". Maximum 2 per results page. | P3 |
| MKT-10 | Regions without marketplace enabled show "Coming soon" with waiting list and lesson request. | P1 |

### 9.15 Reviews and ratings

| ID | Requirement | Phase |
|---|---|---|
| REV-01 | Only learners with at least 1 completed lesson with that instructor can review. One review per learner per instructor, editable. | P2 |
| REV-02 | Rating 1 to 5 stars plus optional text. Tags: patient, clear, punctual, good value, great for nervous drivers. | P2 |
| REV-03 | Instructor can reply publicly once per review. | P2 |
| REV-04 | Report a review. Support Admin moderates. No removal of genuine negative reviews. No paid or incentivised reviews (DMCC Act 2024 rules on fake reviews). | P2 |
| REV-05 | Prompt to review after the 3rd completed lesson and after a test result. | P2 |

### 9.16 Driving school portal

| ID | Requirement | Phase |
|---|---|---|
| SCH-01 | Overview: lessons today, this week, revenue this month, unpaid total, instructor utilisation, new learners. | P1 |
| SCH-02 | Instructors: invite, deactivate, set permissions, set pricing control (school prices or instructor prices), view diaries. | P1 |
| SCH-03 | Learner allocation: manual assign, or suggested instructor by area, transmission and free capacity. | P1 |
| SCH-04 | School-level prices, packages, cancellation policy and booking rules that apply to all instructors unless overridden. | P1 |
| SCH-05 | Payment routing: school collects all payments (default) or instructors collect their own. Instructor earnings statements. | P2 |
| SCH-06 | Fleet: vehicles, registration, transmission, MOT, service and insurance dates with reminders, assignment to instructor. | P2 |
| SCH-07 | Reports: revenue by instructor, utilisation, cancellations, learner pipeline, pass rates. CSV export. | P2 |
| SCH-08 | Multi-branch schools with branch managers. | P5 |
| SCH-09 | Franchise model: instructors pay a weekly franchise fee to the school, tracked in the app. | P5 |

### 9.17 Super Admin

| ID | Requirement | Phase |
|---|---|---|
| ADM-01 | Dashboard: sign-ups by role, active businesses, lessons booked and completed, GMV, fees earned, verification queue, disputes. | P1 |
| ADM-02 | Manage users and Businesses: search, view, suspend, reactivate, reset 2FA. | P1 |
| ADM-03 | Verification queue with badge image, entered details, approve or reject with reason. | P1 |
| ADM-04 | Regions: enable marketplace per postcode area; view supply and demand per area against switch-on thresholds. | P1 |
| ADM-05 | Platform settings: fees, plan limits, feature flags, default booking rules. | P1 |
| ADM-06 | Read-only impersonation for support, with banner and audit entry. | P1 |
| ADM-07 | Audit log of all sensitive actions (see NFR-SEC-06). | P1 |
| ADM-08 | Reviews moderation and disputes handling. | P2 |
| ADM-09 | Content management for city pages, guides and FAQs. | P2 |
| ADM-10 | Plans and subscriptions management. | P2 |

### 9.18 Plans and pricing

All prices live in configuration. The values below are recommended launch defaults to test.

| Plan | Price | Includes |
|---|---|---|
| Free (independent instructor) | £0 | Diary, unlimited learners, lesson records, offline payments, card payments, public profile and booking link, email and push reminders. |
| Pro (independent instructor) | £12 per month or £120 per year | Everything in Free plus SMS reminders (up to 200 per month), auto-charge before lesson, Gap Fill, waiting list automation, expenses and MTD-ready exports, calendar sync, custom booking page colours. |
| School | £9 per instructor per month (minimum 2) | All Pro features plus school portal, allocation, reports, fleet. |
| Founding offer | Pro free for 12 months | First 500 instructors and first 50 schools. |

Card fees: standard Stripe UK rates (about 1.5% plus 20p for UK cards) are passed through to the Business on the Free plan. Doovor takes no fee on lessons between an instructor and their own learners.

Marketplace fee (Phase 3): learner booking fee on the first booking with a new instructor through the marketplace only, 5% capped at £2. Repeat lessons with the same instructor carry no fee. This keeps us cheaper than lead resellers and close to LANE's capped model.

### 9.19 AI features

| ID | Requirement | Phase |
|---|---|---|
| AI-01 | Instructor matching: short quiz (experience, nerves, budget, days, language, transmission) to top 3 matches with reasons. | P4 |
| AI-02 | Smart scheduling suggestions that reduce driving between lessons. | P4 |
| AI-03 | Lesson summary from voice note (PRG-08). | P4 |
| AI-04 | Test readiness prediction trained on recorded outcomes (replaces rule-based PRG-07 when data allows). | P4 |
| AI-05 | Admin assistant for support replies and fraud flags. | P4 |

## 10. Key user flows

### 10.1 Instructor: first 5 minutes

1. Opens the site on phone, taps "I'm an instructor".
2. Signs up with Google or email, verifies phone by SMS code.
3. Adds name and photo, ADI or PDI number and a badge photo.
4. Enters base postcode; map shows the default 8 mile radius; adjusts with a slider.
5. Sets hourly price and optional 10-hour package.
6. Picks weekly working hours from a simple grid.
7. Lands on "Today" with a checklist card: Add your first learner, Connect payments, Share your booking link.
8. Adds a learner by sending a WhatsApp invite. Books their first lesson in 3 taps.

### 10.2 Instructor: a normal day

1. Opens "Today". Sees 5 lessons, 1 unpaid.
2. Taps "Navigate" to the first pickup.
3. After the lesson taps "Complete". Lesson record opens. Taps 3 skills, rates them, types one line, saves.
4. Learner gets a notification with the lesson record. If payment is due after the lesson, the payment link is sent automatically.
5. A learner cancels tomorrow's 10:00 lesson inside 48 hours. Late cancellation fee applies. Gap Fill offers the slot to the waiting list. A waiting learner accepts and pays in 6 minutes.

### 10.3 Learner: invited by their instructor

1. Taps invite link on WhatsApp. Sign-up screen is pre-filled with the instructor's name.
2. Creates account, confirms postcode, adds pickup point.
3. Sees next lesson booked. Adds card or buys a package.
4. After each lesson sees the lesson record and skill progress.

### 10.4 Learner: marketplace (Phase 3)

1. Opens the app. Map shows their area and instructor pins.
2. Taps "Automatic" and "Available this week".
3. Scrolls the bottom sheet. Taps an instructor. Sees profile, reviews, next slots.
4. Taps a slot, chooses pickup point, pays. Booking confirmed screen.
5. If nobody fits, taps "Post a lesson request". Gets 3 offers within a day. Picks one.

### 10.5 School owner: setup

1. Signs up as a school. Adds school name, logo, postcode.
2. Connects Stripe. Sets school prices, packages and cancellation policy.
3. Invites 6 instructors by phone number. Each gets an SMS and completes a short onboarding.
4. Imports 120 learners from CSV. Assigns them to instructors using suggested matches.
5. Watches the Overview dashboard fill as lessons are booked.

## 11. Business rules

| ID | Rule |
|---|---|
| R-01 | A booking occupies the instructor from start time minus buffer to end time plus buffer. Buffer comes from the instructor setting (default 30 minutes). |
| R-02 | Two bookings for the same instructor may never overlap once buffers are applied. Enforce in the database with an exclusion constraint on a time range, not only in application code. Statuses CONFIRMED, REQUESTED (while unexpired) and IN_PROGRESS block time. CANCELLED, NO_SHOW and EXPIRED do not. |
| R-03 | A learner may not hold two overlapping lessons with any instructor. |
| R-04 | Self-booked lessons must sit inside an open availability window and respect minimum notice (default 24 hours) and horizon (default 8 weeks). Instructor-created bookings may sit outside availability after a warning. |
| R-05 | Allowed durations are set per Business (default 60, 90, 120). Price is per lesson type and duration. |
| R-06 | Default cancellation policy: free cancellation up to 48 hours before start. Inside 48 hours the full lesson fee is charged. Business can set the window (0 to 72 hours) and the fee (0%, 50% or 100%). |
| R-07 | If a lesson was paid by credit and cancelled in time, the credit returns in full. If cancelled late, the credit is used as the fee. |
| R-08 | If the instructor cancels, the learner always gets a full refund or credit back, and a reason is required. |
| R-09 | No-show: instructor marks no-show after 15 minutes. Treated as a late cancellation. The learner can dispute within 7 days. |
| R-10 | Booking and payment, or booking and credit deduction, happen in one database transaction. If either fails, both roll back. |
| R-11 | Payment webhooks are idempotent. Every provider event ID is stored and processed once. |
| R-12 | Request-to-book bookings expire if not accepted in time (default 12 hours or 2 hours before start, whichever comes first). Any payment hold is released. |
| R-13 | Recurring bookings are created as individual bookings. If any occurrence clashes, the user sees which dates failed and can accept the rest. |
| R-14 | All times are stored in UTC and shown in Europe/London by default, including correct handling of clock changes. |
| R-15 | Profiles appear in marketplace search only when verified, active, badge not expired, payments connected and at least 1 open slot in the next 28 days (otherwise shown as "Waiting list open"). |
| R-16 | Learners under 18 can use every feature. Instructors see age band only (under 18 or 18 plus), not date of birth. Chat safety rules apply (MSG-02). |
| R-17 | Pass rate is shown only when at least 10 recorded tests exist in the last 12 months (INS-06). |
| R-18 | A PDI must be linked to a supervising school or ADI to take bookings. |

### 11.1 Configurable defaults

| Setting | Default | Range | Level |
|---|---|---|---|
| Buffer between lessons | 30 min | 0 to 60 | Instructor |
| Minimum booking notice | 24 h | 0 to 72 | Business |
| Booking horizon | 8 weeks | 1 to 26 | Business |
| Cancellation window | 48 h | 0 to 72 | Business |
| Late cancellation fee | 100% | 0, 50, 100 | Business |
| Request expiry | 12 h | 1 to 48 | Business |
| Coverage radius | 8 miles | 1 to 30 | Instructor |
| Reminder times | 24 h, 2 h | any | Business |
| Gap Fill wave size and interval | 5 people, 10 min | 1 to 20, 5 to 60 | Platform |
| Marketplace switch-on | 25 instructors, 150 open hours in 14 days | any | Platform |

## 12. Data model (logical)

All tables have `id` (UUID), `created_at`, `updated_at`. Tenant-scoped tables carry `business_id` and are protected by row-level security.

| Entity | Key fields |
|---|---|
| User | email, phone, name, avatar_url, date_of_birth (learners), locale, timezone, marketing_consent, deleted_at |
| Business | type (independent, school), name, slug, logo_url, base_postcode, lat, lng, address, vat_number, stripe_account_id, plan, status (pending, active, suspended), settings (JSON) |
| Membership | user_id, business_id, role (owner, manager, instructor), permissions (JSON), status |
| InstructorProfile | user_id, business_id, display_name, bio, photo_url, languages[], years_teaching, qualification (ADI, PDI), badge_number, badge_expiry, verification_status, verified_at, transmission, car_make, car_model, specialisms[], radius_miles, base_lat, base_lng, instant_book, buffer_minutes, public_slug, is_listed |
| CoverageArea | instructor_id, type (include, exclude), postcode_district |
| Postcode | postcode (normalised), district, area, lat, lng, fetched_at |
| LearnerProfile | user_id, postcode, lat, lng, transmission, experience_level, provisional_licence_confirmed, licence_number_encrypted (optional) |
| LearnerRelationship | learner_id, business_id, instructor_id, status (enquiry, waiting, active, test_booked, passed, left), source (invite, marketplace, import), private_notes |
| PickupPoint | learner_id, label, address, postcode, lat, lng |
| Guardian | payer_user_id, learner_id, permissions |
| WorkingHours | instructor_id, weekday, start_time, end_time |
| AvailabilityException | instructor_id, starts_at, ends_at, type (open, blocked), reason |
| LessonType | business_id, name, duration_minutes, price_pence, is_active |
| Package | business_id, name, minutes, price_pence, lesson_type_id (optional), expiry_days |
| Booking | business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at, blocked_range (tstzrange incl. buffers), pickup_point_id, status, payment_status, price_pence, recurrence_id, created_by, cancelled_by, cancel_reason, vehicle_id |
| Recurrence | rule (weekly), count, until |
| CreditLedger | business_id, learner_id, entry_type (purchase, use, return, adjustment, expiry), minutes, booking_id, payment_id |
| Payment | business_id, learner_id, payer_id, provider, provider_ref, amount_pence, fee_pence, method (card, cash, bank), status, refunded_pence, receipt_url |
| ProviderEvent | provider, event_id (unique), type, processed_at |
| LessonRecord | booking_id, instructor_id, learner_id, summary, next_focus, homework, visibility |
| SkillRating | lesson_record_id, skill_code, rating (1 to 5) |
| MockTest | learner_id, instructor_id, date, faults (JSON by skill: minor, serious, dangerous), result |
| DrivingTest | learner_id, date_time, test_centre_id, booking_reference_encrypted, result, minors, serious, dangerous, shared_with (business ids) |
| TestCentre | name, address, postcode, lat, lng |
| WaitingListEntry | business_id, learner_id or contact fields, preferences (JSON), status |
| GapFillOffer | booking_slot, business_id, recipients, wave, status, accepted_by |
| LessonRequest | learner_id, postcode, lat, lng, transmission, availability (JSON), budget_pence, start_by, status, expires_at |
| LessonOffer | lesson_request_id, instructor_id, message, price_pence, proposed_slots, status |
| Review | instructor_id, business_id, learner_id, rating, text, tags[], reply, status |
| Conversation, Message | participants, body, attachments, read_at, reported |
| Notification | user_id, type, channel, payload, sent_at, read_at |
| Vehicle | business_id, registration, make, model, transmission, mot_due, service_due, insurance_due, assigned_instructor_id |
| Expense | business_id, instructor_id, category, amount_pence, date, receipt_url, mileage |
| Subscription | business_id, plan, status, provider_ref, current_period_end |
| Region | postcode_area, marketplace_enabled, thresholds (JSON) |
| AuditLog | actor_user_id, actor_role, action, entity, entity_id, before, after, ip, user_agent |
| FeatureFlag | key, scope, value |

Money is always stored as integer pence. Never floats.

## 13. Integrations

| Purpose | Provider (default) | Notes |
|---|---|---|
| Payments and payouts | Stripe Connect (Express), Stripe Billing for subscriptions | Behind a PaymentsProvider interface. |
| Postcodes | postcodes.io | Free, UK postcodes. Cache in Postcode table. |
| Maps | Mapbox GL JS | Monochrome custom style to match the brand. Behind a MapProvider interface. |
| Email | Resend | Branded templates in React Email. |
| SMS | Twilio | UK sender ID. Used for OTP, reminders and Gap Fill. |
| Web push | Web Push (VAPID) | PWA notifications. |
| Calendar sync | Google Calendar API, Microsoft Graph | Phase 2. |
| Error tracking | Sentry | Frontend and backend. |
| Product analytics | PostHog (EU cloud) | Consent-aware. |
| AI | Anthropic Claude API | Phase 4 features. |

## 14. Non-functional requirements

### 14.1 Performance

| ID | Requirement |
|---|---|
| NFR-PERF-01 | Largest Contentful Paint under 2.0 seconds on 4G for public pages; Interaction to Next Paint under 200 milliseconds. |
| NFR-PERF-02 | API p95 under 300 milliseconds for reads, under 600 milliseconds for booking writes. |
| NFR-PERF-03 | Search results for a postcode in under 1 second at 20,000 instructors. |
| NFR-PERF-04 | Lighthouse score 90 or higher for Performance, Accessibility, Best Practices and SEO on public pages. |

### 14.2 Security

| ID | Requirement |
|---|---|
| NFR-SEC-01 | Row-level security on every tenant table. Automated tests prove Business A cannot read or write Business B data by guessing IDs. |
| NFR-SEC-02 | All secrets in environment variables. No secrets in the client bundle. |
| NFR-SEC-03 | OWASP Top 10 protections, rate limiting on auth, booking and messaging endpoints, input validation on every endpoint with a shared schema library. |
| NFR-SEC-04 | Sensitive fields (licence number, test booking reference) encrypted at column level. |
| NFR-SEC-05 | Card data never touches our servers. Stripe Elements and Checkout only. |
| NFR-SEC-06 | Audit log for sign-in, role change, verification decisions, refunds, payout changes, data export, account deletion, impersonation. |
| NFR-SEC-07 | Daily encrypted backups, point-in-time recovery 7 days, restore tested each quarter. |

### 14.3 Privacy (UK GDPR and Data Protection Act 2018)

| ID | Requirement |
|---|---|
| NFR-PRV-01 | Data hosted in the UK or EU (London region preferred). |
| NFR-PRV-02 | Privacy notice, cookie banner with real choice (no analytics before consent), terms for learners, terms for Businesses, data processing terms for Businesses. |
| NFR-PRV-03 | Self-service data export (JSON and PDF) and account deletion. Deletion anonymises records that must be kept for tax (6 years for financial records). |
| NFR-PRV-04 | Data minimisation: licence number optional; instructors see age band, not date of birth. |
| NFR-PRV-05 | Marketing emails and SMS only with opt-in consent (PECR). Service messages allowed without. |
| NFR-PRV-06 | Records of processing and data retention schedule maintained. |

### 14.4 Accessibility and usability

- WCAG 2.2 AA. Colour contrast checked for all tokens (yellow only with black text).
- Full keyboard use on desktop, screen reader labels, focus states visible.
- Text scales to 200% without breaking layouts.

### 14.5 Reliability and operations

- 99.9% monthly uptime target for booking and payments.
- Background jobs with retries and dead-letter handling for reminders, webhooks and Gap Fill.
- Health checks, structured logs, uptime alerts to the founders' phones.
- Zero-downtime deploys. Database migrations run forward only and are reversible by a follow-up migration.

### 14.6 SEO

- Server-side rendering for public pages. Clean URLs (section 8.3). XML sitemaps split by type. Canonical tags. Open Graph images generated per profile.
- Structured data per section PUB-02. Breadcrumb markup on city and area pages.
- Internal links: city hub to area pages to instructor profiles and back.
- Guides cluster on learning to drive, test booking under the 2026 rules, costs, manual vs automatic, instructor business tips.

## 15. UK legal and compliance checklist

Get a UK solicitor to review before launch. This list is a starting point, not legal advice.

- Register Maxterz LTD (or a new company for the product) with the ICO and pay the data protection fee.
- Terms of service for learners and for Businesses; data processing agreement for Businesses (they are controllers of their learner data, we are processor; for marketplace data we are controller).
- Consumer Contracts Regulations 2013: 14-day cancellation right for distance contracts. Learners must expressly ask for lessons to start within 14 days, and packages need clear refund terms.
- Digital Markets, Competition and Consumers Act 2024: no fake or incentivised reviews, clear total prices including fees (no drip pricing).
- Stripe Connect terms and platform responsibilities; no platform-held wallet (PAY-12).
- Safeguarding policy covering under-18 learners, chat reporting and instructor conduct.
- DVSA rules: no automated or third-party test booking; only show DVSA content under the Open Government Licence where used.
- Accessibility statement.
- VAT registration once platform revenue passes the threshold; Businesses handle their own VAT.
- Trademark search and registration for the final name (UK IPO), plus domains .com and .co.uk.

## 16. Analytics and events

Track with consent. Core events:

`signup_started`, `signup_completed` (role), `onboarding_step_completed` (step), `instructor_verified`, `stripe_connected`, `learner_added` (method), `invite_sent`, `invite_accepted`, `booking_created` (source: instructor, self, marketplace, gap_fill), `booking_cancelled` (by, late), `lesson_completed`, `lesson_record_saved` (seconds taken), `payment_succeeded` (method), `package_purchased`, `gap_fill_offer_sent`, `gap_fill_filled`, `search_performed` (postcode area, results count), `profile_viewed`, `lesson_request_created`, `review_submitted`, `plan_upgraded`.

Dashboards: activation funnel, weekly active instructors, lessons per week, payment mix, Gap Fill fill rate, supply and demand per region.

## 17. Release plan and acceptance criteria

### 17.1 Phase 1 milestones

| Milestone | Scope | Exit criteria |
|---|---|---|
| M0 Foundation | Repo, CI, environments, design system tokens and components, auth, roles, Business tenancy, RLS, audit log, seed data. | Sign up as each role. Tenancy tests pass. Storybook or component page shows all components. |
| M1 Instructor core | Onboarding, profile, verification upload, coverage, working hours, diary views. | Instructor completes onboarding in under 5 minutes in a usability test. |
| M2 Learners and bookings | Learner CRM, invites, CSV import, bookings, recurring, reschedule, cancel, overlap protection, reminders. | All booking acceptance tests (17.2) pass. |
| M3 Payments | Stripe Connect onboarding, card payments, packages and credit ledger, offline payments, refunds, receipts, cancellation fees. | All payment acceptance tests pass in Stripe test mode. |
| M4 Progress | Lesson records, skill map, learner timeline, offline mode. | Lesson record saves in under 60 seconds with no signal and syncs later. |
| M5 Public and school | Public profiles, booking link, SEO, school portal basics, Super Admin, region flags. | Lighthouse 90 plus on profile pages. School can invite instructors and allocate learners. |
| M6 Hardening | Security review, load test, accessibility audit, legal pages, analytics, monitoring, beta with 20 instructors. | No P1 bugs open. Beta instructors run their week on the app. |

### 17.2 Phase 1 acceptance tests (must pass)

1. An instructor with buffer 30 minutes has a lesson 10:00 to 11:00. Booking 11:15 to 12:15 is rejected with "Too close to your 10:00 lesson". Booking 11:30 to 12:30 succeeds.
2. Two learners try to book the same slot at the same moment. Exactly one succeeds; the other sees "This slot was just taken".
3. A learner with 120 minutes credit books a 60-minute lesson. Credit shows 60 minutes. They cancel 72 hours before. Credit returns to 120.
4. A learner cancels 24 hours before a card-paid lesson with the default policy. The full fee is kept and the learner receives an email explaining why.
5. The instructor cancels a paid lesson. The learner is refunded in full automatically.
6. A Stripe webhook for the same payment is delivered 3 times. Exactly one payment and one credit entry exist.
7. A user from Business A requests Business B's learner by ID through the API. The response is not found.
8. A lesson record is saved in airplane mode and appears for the learner after reconnecting.
9. Clocks go forward on the last Sunday in March. A weekly recurring 09:00 lesson stays at 09:00 London time.
10. An instructor with an expired badge disappears from search and the public profile shows "Not taking new bookings".
11. A school manager cannot see payouts or billing.
12. A learner completes self-booking from a shared booking link on a phone in under 60 seconds.

### 17.3 Phase 2 and 3 exit criteria (summary)

- Phase 2: Gap Fill fills at least 30% of late cancellations in beta regions; 100 schools active; MTD export accepted by 3 accountants in testing.
- Phase 3: First region live under the switch-on rule; median time from search to confirmed booking under 3 minutes; marketplace booking conversion 8% or higher from profile view.

## 18. Out of scope for Phase 1

Native apps, in-app chat, reviews, waiting list automation and Gap Fill, marketplace search, lesson requests, calendar sync, expenses and tax exports, fleet, multi-branch, AI features, theory test content, gift cards, partner offers, international markets.

## 19. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| LANE and Instruct Me reach instructors first | High | Win on business tools and simplicity. Free core. Founding offer. Import tools that make switching take 10 minutes. Target instructors, not just learners. |
| Instructors keep using WhatsApp and cash | High | WhatsApp invite and share flows, offline payment recording, 3-tap booking. Meet them where they are. |
| Marketplace launched with no supply | High | Regional switch-on rule. Waiting lists and lesson requests collect demand first. |
| Double bookings or payment errors damage trust | High | Database-level constraints, idempotent webhooks, full acceptance tests, monitoring. |
| Safeguarding incident with under-18 learners | High | Verified instructors only, logged chat, reporting, safeguarding policy, fast suspension tools. |
| Regulation on holding funds | Medium | No platform wallet. Stripe Connect handles funds and KYC. |
| Price war with free tools | Medium | Free core forever. Monetise Pro, schools and marketplace growth. |

## 20. Open decisions

| Decision | Owner | Due |
|---|---|---|
| Final brand name, trademark and domains | Talha | Before public launch |
| Final pricing values (section 9.18) | Talha | After beta with 20 instructors |
| Merchant of record model sign-off with Stripe and solicitor | Talha and solicitor | Before M3 goes live |
| First launch region | Talha | Before M6 beta |

## Appendix A. Skill map (DVSA test report aligned)

| Code | Skill area | Sub-skills |
|---|---|---|
| CTRL | Controls | Accelerator, clutch, gears, footbrake, parking brake, steering, ancillary controls |
| COCKPIT | Cockpit checks and Show me Tell me | Seat, mirrors, doors, seatbelt, vehicle safety questions |
| MOVEOFF | Moving off | Safely, under control, on a hill, at an angle |
| MIRRORS | Use of mirrors | Signalling, change direction, change speed |
| SIGNALS | Signals | Necessary, correctly, timed |
| CLEAR | Clearance to obstructions | |
| RESPONSE | Response to signs and signals | Traffic signs, road markings, traffic lights, traffic controllers, other road users |
| SPEED | Use of speed | |
| FOLLOW | Following distance | |
| PROGRESS | Progress | Appropriate speed, undue hesitation |
| JUNCTIONS | Junctions | Approach speed, observation, turning right, turning left, cutting corners |
| ROUNDABOUT | Roundabouts | Approach, lane choice, signals, exit |
| JUDGEMENT | Judgement | Overtaking, meeting, crossing |
| POSITION | Positioning | Normal driving, lane discipline |
| PEDX | Pedestrian crossings | |
| STOPS | Position for normal stops | |
| AWARE | Awareness and planning | Hazard perception, anticipation |
| E-STOP | Emergency stop | |
| MANOEUVRE | Manoeuvres | Parallel park, bay park forward, bay park reverse, pull up on right and reverse |
| DUALCW | Dual carriageways and fast roads | Joining, lane changes, leaving |
| RURAL | Rural roads | Bends, narrow roads, passing places |
| INDEP | Independent driving | Following sat nav, following signs |
| ECO | Eco-safe driving | Planning, control |

Rating scale: 1 Introduced, 2 Under full instruction, 3 Prompted, 4 Seldom prompted, 5 Independent.

## Appendix B. Notification catalogue (Phase 1)

| Event | Learner | Instructor | School | Channels |
|---|---|---|---|---|
| Booking confirmed | Yes | Yes | Manager digest | Push, email |
| Booking request received | No | Yes | No | Push, email |
| Booking request accepted or declined | Yes | No | No | Push, email |
| Lesson reminder (24 h, 2 h) | Yes | Optional | No | Push, email, SMS on Pro |
| Lesson changed | Yes | Yes | Yes | Push, email |
| Lesson cancelled | Yes | Yes | Yes | Push, email |
| Payment received | Receipt | Yes | Daily summary | Email, push |
| Payment failed or overdue | Yes | Yes | Yes | Email, push |
| Lesson record added | Yes | No | No | Push |
| Credit running low (2 hours left) | Yes | Yes | No | Push, email |
| Verification approved or rejected | No | Yes | Yes | Email, push |
| Badge expiry (60, 30, 7 days) | No | Yes | Yes | Email, push |
| New learner invite accepted | No | Yes | Yes | Push |

## Appendix C. Glossary

- **ADI:** Approved Driving Instructor, fully qualified and on the DVSA register (green badge).
- **PDI:** Potential Driving Instructor on a trainee licence (pink badge).
- **DVSA:** Driver and Vehicle Standards Agency.
- **DL25:** The DVSA driving test report form.
- **MTD:** Making Tax Digital, HMRC's digital record-keeping and quarterly reporting scheme.
- **Business:** A tenant in Doovor. An independent instructor or a driving school.
- **Gap Fill:** Automatic offer of a cancelled slot to learners who want it.
- **Driving Passport:** The learner-owned progress record.
- **GMV:** Gross merchandise value, total lesson value paid through the platform.

## Appendix D. Sources

- LANE: https://joinlane.app/
- Instruct Me launch and instructor availability figures: https://www.businesscheshire.co.uk/2026/03/06/new-driving-lesson-marketplace-launches-amid-driving-instructor-shortage
- Instructor software prices (August 2026): https://passready.co.uk/blog/best-driving-instructor-software-2026.html
- DVSA test booking change from 12 May 2026: https://www.driving.org/from-12-may-2026-only-learners-can-manage-driving-test-bookings/
- MTD for Income Tax thresholds: https://www.accountex.co.uk/insight/2026/04/30/making-tax-digital-for-sole-traders-do-the-rules-apply-to-you/
- Stripe UK card fees: https://www.wearefounders.uk/stripe-fees-uk-2026/
- DVSA test report form (DL25): https://assets.publishing.service.gov.uk/media/62a7437cd3bf7f03667c667a/dl25-driving-test-report.pdf
- Checking ADI and PDI credentials: https://www.learn-automatic.com/getting-started/learning-to-drive-faq/check-driving-instructor-qualified/
