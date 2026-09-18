'use client';

import { formatPence } from '@repo/core/money';
import { formatDate, formatMinutes, formatTime, todayInZone } from '@repo/core/time';
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
import { useEffect, useState, useTransition } from 'react';
import { track } from '@/lib/analytics/track';
import { FormAlert } from '@/components/form-alert';
import { avatarUrl } from '@/lib/storage/images';
import type { BookingPage } from '@/lib/booking/public';
import { bookAsLearner, rememberSlot, slotsOnDay } from './actions';

export interface BookWithInstructorProps {
  page: BookingPage;
  slug: string;
  /** A time carried back from signing up, already chosen (BOK-02). */
  chosen: string | null;
  learner: { id: string } | null;
  signedIn: boolean;
  /** The instructor's public profile, in full, when there is one. */
  profileUrl: string | null;
  /** The first day with a free time, to open on when nothing is chosen yet. */
  firstFreeDay: string | null;
}

/** BOK-02: choose how long, choose when, book. On a phone, in under a minute. */
export function BookWithInstructor({ page, slug, chosen, learner, signedIn, profileUrl, firstFreeDay }: BookWithInstructorProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState<string | null>(null);
  /** The booking to pay for, when this Business takes the money at booking (PAY-03). */
  const [payNow, setPayNow] = useState<string | null>(null);

  const first = page.lessons[0];
  const [lessonKey, setLessonKey] = useState(
    first ? `${first.lessonTypeId}:${String(first.durationMinutes)}` : '',
  );
  const [day, setDay] = useState(chosen === null ? (firstFreeDay ?? todayInZone()) : chosen.slice(0, 10));
  const [times, setTimes] = useState<{ asked: string; slots: string[] } | null>(null);
  const [chosenSlot, setChosenSlot] = useState<string | null>(chosen);

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
      setBooked(slot);
      setPayNow(result.data.payNow ? result.data.bookingId : null);
    });
  };

  if (booked !== null) {
    return (
      <Card className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="size-6 shrink-0 text-black" aria-hidden />
          <CardTitle>{page.instantBook ? 'Lesson booked' : 'Lesson requested'}</CardTitle>
        </div>
        <CardDescription>
          {formatDate(new Date(booked))} at {formatTime(new Date(booked))} with {page.name}.
          {page.instantBook ? ' It is in their diary.' : ' They will confirm it shortly.'}
        </CardDescription>
        {payNow === null ? (
          <Button asChild width="responsive">
            <Link href="/app/learner">See my lessons</Link>
          </Button>
        ) : (
          <div className="flex flex-col gap-2">
            <Button asChild width="responsive">
              <Link href={`/app/learner/pay/${payNow}`}>Pay for it now</Link>
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
        {/* A booking link only takes bookings for an instructor the platform has checked (INS-02). */}
        <Avatar name={page.name} src={avatarUrl(page.photoPath)} verified size="lg" decorative />
        <div className="flex min-w-0 flex-col">
          <h1 className="text-h1 text-black">{page.name}</h1>
          <p className="text-small text-grey-700">
            {page.businessName}
            {page.car === null ? '' : ` · ${page.car}`} ·{' '}
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
          <Input type="date" defaultValue={day} min={todayInZone()} onChange={(event) => { setDay(event.target.value); }} />
        </Field>

        {loading || times === null ? (
          <Skeleton className="h-28 w-full" />
        ) : times.slots.length === 0 ? (
          <p className="text-small text-grey-700">
            Nothing free on {formatDate(new Date(`${day}T12:00:00Z`))}. Try another day.
          </p>
        ) : (
          <TimeSlotGrid
            label={`Times on ${formatDate(new Date(`${day}T12:00:00Z`))}`}
            value={slot}
            onChange={setChosenSlot}
            slots={times.slots.map((one) => ({ id: one, label: formatTime(new Date(one)) }))}
          />
        )}
      </Card>

      {signedIn && learner === null ? (
        <FormAlert>You are signed in as somebody who is not a learner, so you cannot book here.</FormAlert>
      ) : null}

      <Button
        width="full"
        size="lg"
        pending={pending}
        disabled={slot === null || !lesson || (signedIn && learner === null)}
        onClick={confirm}
      >
        {slot === null || !lesson
          ? 'Choose a time'
          : learner === null
            ? `Continue with ${formatTime(new Date(slot))}`
            : `Book ${formatTime(new Date(slot))} for ${formatPence(lesson.pricePence)}`}
      </Button>

      {learner === null && !signedIn ? (
        <p className="text-small text-grey-700">
          You will make an account in a moment, then come straight back to finish.
        </p>
      ) : null}
    </div>
  );
}
