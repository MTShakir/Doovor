# M8: UI and UX improvements

Notes for review. Every change here is a small one made to an existing screen. Nothing was
redesigned, no colour was added to the palette beyond the pale yellow that already arrived with
D-209, and no feature was added or removed.

This branch is `m8-UI/UX-upgrade`. Git does not allow a space in a branch name, so the requested
`m8-UI/UX upgrade` became a hyphen.

## What the research said

Two things were worth reading about: what UK driving instructors already use, and what goes wrong
for users who are not confident with software.

The UK market (Total Drive, MyDriveTime, ADI Book, GoRoadie Pro, Lesson Diary) is built around one
loop: diary, pupil, lesson, money. Every one of them leads with the diary. That matters here
because it is what instructors are used to, and because the context is a phone held in one hand
between lessons, often at the kerb. The question being asked is "who is next", not "how was my
week".

On usability, the finding that applies most directly is that a complex interface is the second
most serious barrier for older users, and that small text, poor contrast and small targets are the
usual culprits. This product is already careful about all three: 48px touch targets, grey-700
rather than grey-400 for muted text, and a contrast rule enforced in tests (D-009). So there was
little to win there, and the work went into hierarchy instead: not making things bigger, but
making the important thing look more important than the unimportant thing next to it.

## The changes

### 1. Today leads with today's lessons

`apps/web/src/app/(portal)/app/instructor/page.tsx`

The week's takings card sat above the lessons, so on a phone an instructor scrolled past a bar
chart to find out who was next and to reach Start lesson. Today's lessons was also the only block
on the screen with no heading, while the less urgent "Upcoming lessons" below it had one.

The lessons now come first and carry a heading; the takings card moves below. PRD 7.5 describes
this screen as "a vertical timeline of today's lessons" and does not mention the takings at all,
so this puts the screen back to what it was specified as.

This is the only change on the branch that moves a block rather than restyling one. It is one
reordered element and is easy to undo.

### 2. Money owed is the one thing in yellow

`apps/web/src/components/money-screen.tsx`

Four figures sat in four identical grey tiles: Paid, Unpaid, Credit sold, Refunds. Two of them are
usually zero. The one an instructor has to act on, money owed, had exactly the same weight as a
zero.

Unpaid now sits on the palest yellow, and only when there is money owed. At zero it stays grey
like the others. Nothing else on the screen uses yellow.

### 3. "Back to today" looks like a control

`apps/web/src/app/(portal)/app/instructor/diary/diary-nav.tsx`

It was bold black text on white, which reads as a heading for the day on screen. The comment above
it in the code says the wording was already changed once for exactly that reason; the look had not
caught up. It now wears the same grey pill as the arrows and the Day/Week/Month toggle beside it,
with a calendar icon, so the row reads as one set of controls.

### 4. "Show more" matches "Load more"

`apps/web/src/components/lessons/upcoming-lessons.tsx`

The same action had two looks in one product: Money's "Load more" was a grey button, Today's
"Show more" was bare bold text. Today's now matches.

### 5. There is a way back from every screen reached from More

`apps/web/src/components/back-link.tsx` and six pages

The books screens and the learner card had a back link written out by hand; the screens reached
from More did not have one at all. The markup is now one `BackLink` component, used by the screens
that were missing it. It names where it goes rather than saying "Back".

### 6. More is reachable on a desktop

`apps/web/src/lib/navigation.ts`

More was marked `desktop: false`, so the sidebar on a laptop had no route to Your plan, Refer an
instructor, Payment setup, Bookkeeping, Your booking colours or Tell us something. They were
reachable only by typing the address. One flag fixes it.

## What was deliberately left alone

- **The four money tiles stay in one column on a phone.** Two columns would halve the height, but
  "Card £0, cash £188.31, bank £0" wraps to three lines at that width and the grid would make every
  tile as tall as the tallest. The yellow does the same job without the reflow.
- **The setup checklist stays at the top of Today.** It is there for somebody's first week and goes
  away when it is finished.
- **Text actions were already icons where it matters.** Removing an expense, taking a picture off a
  report and retiring a car are already icon buttons with proper labels and a confirmation. The
  remaining "Remove it" strings are the confirm buttons inside those sheets, which should stay
  words: a confirmation is the one place to be explicit.
- **The diary itself.** It is the best screen in the product: the times are already start-bold and
  end-grey, the gaps between lessons are called out, and the rows separate cleanly.
- **Typography, spacing scale, colours and components.** Untouched.
