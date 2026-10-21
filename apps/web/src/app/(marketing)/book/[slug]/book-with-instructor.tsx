'use client';

import { formatPence } from '@repo/core/money';
import type { ProfileNames } from '@repo/core/public-profile';
import { formatDate, formatMinutes, formatTime, isValidLocalDate, todayInZone } from '@repo/core/time';
import { Avatar } from '@repo/ui/avatar';
import { Button } from '@repo/ui/button';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { Select } from '@repo/ui/select';
import { Skeleton } from '@repo/ui/skeleton';
import { TimeSlotGrid } from '@repo/ui/time-slot-grid';
import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { track } from '@/lib/analytics/track';
import { FormAlert } from '@/components/form-alert';
import { avatarUrl } from '@/lib/storage/images';
import type { BookingPage } from '@/lib/booking/public';
import { bookAsLearner, rememberSlot, slotsOnDay, type Booked, type BookedNext } from './actions';

export interface BookWithInstructorProps {
  page: BookingPage;
  /** What the page is headed with: a Business name for somebody running their own, with theirs above (D-269). */
  names: ProfileNames;
  slug: string;
  /** A time carried back from signing up, already chosen (BOK-02). */
  chosen: string | null;
  /** The cancellation policy in words, said before booking (BOK-09, R-06). Null when it cannot be read. */
  cancellation: string | null;
  learner: { id: string } | null;
  signedIn: boolean;
  /** The instructor's public profile, in full, when there is one. */
  profileUrl: string | null;
  /** The first day with a free time, to open on when nothing is chosen yet. */
  firstFreeDay: string | null;
}

/** The button to what is left to pay, by what is left to do (PAY-03, R-12, D-318). Null for nothing. */
const payWords: Record<BookedNext, string | null> = {
  nothing: null,
  pay: 'Pay for it now',
  pay_to_confirm: 'Pay to confirm it',
  authorise: 'Authorise the payment',
  save_card: 'Save a card',
};

/** BOK-02: choose how long, choose when, book. On a phone, in under a minute. */
export function BookWithInstructor({ page, names, slug, chosen, cancellation, learner, signedIn, profileUrl, firstFreeDay }: BookWithInstructorProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  /** The time booked, and what is left to do with it (PAY-03, D-318). */
  const [booked, setBooked] = useState<{ at: string; lesson: Booked } | null>(null);

  const first = page.lessons[0];
  const [lessonKey, setLessonKey] = useState(
    first ? `${first.lessonTypeId}:${String(first.durationMinutes)}` : '',
  );
  const [day, setDay] = useState(chosen === null ? (firstFreeDay ?? todayInZone()) : chosen.slice(0, 10));
  const [times, setTimes] = useState<{ asked: string; slots: string[] } | null>(null);
  const [chosenSlot, setChosenSlot] = useState<string | null>(chosen);
  // A day picked before the page was ready fired no change, so the box is read once it is, and
  // the times follow what it shows (D-319).
  const readDay = useCallback((box: HTMLInputElement | null) => {
    if (box !== null && box.value !== '' && isValidLocalDate(box.value)) setDay(box.value);
  }, []);

  const lesson = page.lessons.find((one) => `${one.lessonTypeId}:${String(one.durationMinutes)}` === lessonKey);
  const asked = lesson ? `${day}:${String(lesson.durationMinutes)}` : '';
  const loading = lesson !== undefined && times?.asked !== asked;
  const slot = chosenSlot !== null && (times?.slots.includes(chosenSlot) ?? false) ? chosenSlot : null;

  useEffect(() => {
    if (!lesson || times?.asked === asked) return;
    let current = true;
    void slotsOnDay({ instructorId: page.instructorId, date: day, durationMinutes: lesson.durationMinutes }).then(
      (result) => {
        if (!current) return;
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setTimes({ asked, slots: result.data });
      },
    );
    return () => {
      current = false;
    };
  }, [page.instructorId, day, lesson, asked, times?.asked]);

  const confirm = () => {
    if (!lesson || slot === null) return;
    setError(null);
    startTransition(async () => {
      if (learner === null) {
        // No account yet: the time waits while they make one, then the link brings it back.
        const kept = await rememberSlot({ slug, startsAt: slot });
        if (!kept.ok) setError(kept.message);
        return;
      }
      const result = await bookAsLearner({
        instructorId: page.instructorId,
        lessonTypeId: lesson.lessonTypeId,
        startsAt: slot,
        durationMinutes: lesson.durationMinutes,
      });
      if (!result.ok) {
        setError(result.message);
        setTimes(null);
        return;
      }
      track('booking_created', { source: 'self', recurring: false });
      setBooked({ at: slot, lesson: result.data });
    });
  };

  if (booked !== null) {
    const { lesson } = booked;
    const pay = payWords[lesson.next];
    return (
      <Card className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="size-6 shrink-0 text-black" aria-hidden />
          <CardTitle>
            {lesson.status === 'requested' ? 'Lesson requested' : lesson.status === 'pending_payment' ? 'Lesson held' : 'Lesson booked'}
          </CardTitle>
        </div>
        <CardDescription>
          {formatDate(new Date(booked.at))} at {formatTime(new Date(booked.at))} with {page.name}.
          {lesson.status === 'requested'
            ? ' They will confirm it shortly.'
            : lesson.status === 'pending_payment'
              ? lesson.holdUntil === null
                ? ' Pay for it to confirm it.'
                : ` It is yours until ${formatTime(new Date(lesson.holdUntil))}: pay by then to confirm it.`
              : ' It is in their diary.'}
        </CardDescription>
        {lesson.paidWithCredit ? <p className="text-small text-ink">Paid from your lesson credit.</p> : null}
        {lesson.next === 'authorise' ? (
          <p className="text-small text-ink">Authorise the payment now. Your card is only charged if they accept.</p>
        ) : lesson.next === 'save_card' ? (
          <p className="text-small text-ink">Save a card and it is charged the day before the lesson. Nothing is taken until then.</p>
        ) : lesson.paidLater === 'day_before' ? (
          <p className="text-small text-ink">It is charged to your saved card the day before the lesson.</p>
        ) : lesson.paidLater === 'after' ? (
          <p className="text-small text-ink">You pay after the lesson, by a link we send you when it is done.</p>
        ) : null}
        {pay === null ? (
          <Button asChild width="responsive">
            <Link href="/app/learner">See my lessons</Link>
          </Button>
        ) : (
          <div className="flex flex-col gap-2">
            <Button asChild width="responsive">
              <Link href={`/app/learner/pay/${lesson.bookingId}`}>{pay}</Link>
            </Button>
            <Button asChild variant="secondary" width="responsive">
              <Link href="/app/learner">See my lessons</Link>
            </Button>
          </div>
        )}
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        {/* A link takes bookings for an instructor the platform checked, or a school vouches for; the
            tick is only for the first (INS-02, D-280). */}
        <Avatar name={names.personal ?? names.main} src={avatarUrl(page.photoPath)} verified={page.platformChecked} size="lg" decorative />
        <div className="flex min-w-0 flex-col">
          {names.personal === null ? null : <p className="text-caption text-grey-700">{names.personal}</p>}
          {/* D-210: the instructor's own colour, where they are on a plan that carries it. */}
          <h1 className="text-h1 text-black" style={page.brandColour === null ? undefined : { color: page.brandColour }}>
            {names.main}
          </h1>
          <p className="text-small text-grey-700">
            {/* The Business, unless it is already the heading. */}
            {names.main === page.businessName ? '' : `${page.businessName} · `}
            {page.car === null ? '' : `${page.car} · `}
            {page.transmission === 'automatic' ? 'Automatic' : page.transmission === 'both' ? 'Manual or automatic' : 'Manual'}
          </p>
          {profileUrl === null ? null : (
            <a href={profileUrl} className="text-small font-semibold text-blue underline underline-offset-4">
              See the full profile
            </a>
          )}
        </div>
      </div>

      {error ? <FormAlert>{error}</FormAlert> : null}

      {/* Nothing priced yet, as at a school that has still to set its prices: said plainly, rather
          than a list with nothing in it and times that never come (R-05, D-329). */}
      {page.lessons.length === 0 ? (
        <Card className="flex flex-col gap-1">
          <CardTitle>Not taking bookings yet</CardTitle>
          <CardDescription>Lessons can be booked here once their prices are set. Try again soon.</CardDescription>
        </Card>
      ) : (
        <>
          <Card className="flex flex-col gap-4">
            <Field label="Which lesson?">
              <Select
                value={lessonKey}
                onChange={(event) => { setLessonKey(event.target.value); }}
                options={page.lessons.map((one) => ({
                  value: `${one.lessonTypeId}:${String(one.durationMinutes)}`,
                  label: `${one.name}, ${formatMinutes(one.durationMinutes)}, ${formatPence(one.pricePence)}`,
                }))}
              />
            </Field>

            <Field label="Which day?">
              {/* The browser owns what is in the box; this only listens (D-043). */}
              <Input ref={readDay} type="date" defaultValue={day} min={todayInZone()} onChange={(event) => { setDay(event.target.value); }} />
            </Field>

            {loading || times === null ? (
              <Skeleton className="h-28 w-full" />
            ) : times.slots.length === 0 ? (
              <p className="text-small text-grey-700">
                Nothing free on {formatDate(new Date(`${day}T12:00:00Z`))}. Try another day.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {/* Said as well as announced, so the times are plainly the day in the box (D-319). */}
                <p className="text-small font-semibold text-black" aria-hidden>
                  Times on {formatDate(new Date(`${day}T12:00:00Z`))}
                </p>
                <TimeSlotGrid
                  label={`Times on ${formatDate(new Date(`${day}T12:00:00Z`))}`}
                  value={slot}
                  onChange={setChosenSlot}
                  slots={times.slots.map((one) => ({ id: one, label: formatTime(new Date(one)) }))}
                />
              </div>
            )}
          </Card>

          {signedIn && learner === null ? (
            <FormAlert>You are signed in as somebody who is not a learner, so you cannot book here.</FormAlert>
          ) : null}

          {cancellation === null ? null : <p className="text-small text-grey-700">{cancellation}</p>}

          <Button
            width="full"
            size="lg"
            pending={pending}
            disabled={slot === null || !lesson || (signedIn && learner === null)}
            onClick={confirm}
            style={page.brandColour === null ? undefined : { backgroundColor: page.brandColour }}
          >
            {slot === null || !lesson
              ? 'Choose a time'
              : learner === null
                ? `Continue with ${formatTime(new Date(slot))}`
                : page.instantBook
                  ? `Book ${formatTime(new Date(slot))} for ${formatPence(lesson.pricePence)}`
                  : `Ask for ${formatTime(new Date(slot))}`}
          </Button>

          {learner === null && !signedIn ? (
            <p className="text-small text-grey-700">
              You will make an account in a moment, then come straight back to finish.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
