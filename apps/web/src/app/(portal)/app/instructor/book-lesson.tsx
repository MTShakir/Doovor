'use client';

import { formatPence } from '@repo/core/money';
import { formatDate, formatMinutes, formatTime, todayInZone, utcToLocal } from '@repo/core/time';
import { Button } from '@repo/ui/button';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { Select } from '@repo/ui/select';
import { Sheet } from '@repo/ui/sheet';
import { Skeleton } from '@repo/ui/skeleton';
import { TimeSlotGrid } from '@repo/ui/time-slot-grid';
import { toast } from '@repo/ui/toast';
import { CalendarPlus } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';
import { FormAlert } from '@/components/form-alert';
import type { LessonOption } from '@/lib/booking/day';
import { bookableLessons, bookLesson, bookWeekly, slotsForDay } from './booking-actions';

/** How often it happens. Most learners have the same slot every week (BOK-05). */
const repeats = [
  { value: '1', label: 'Just this one' },
  { value: '4', label: 'Every week for 4 weeks' },
  { value: '6', label: 'Every week for 6 weeks' },
  { value: '12', label: 'Every week for 12 weeks' },
  { value: 'open', label: 'Every week until I stop it' },
];

export interface BookableLearner {
  id: string;
  name: string;
  usualDurationMinutes: number | null;
}

export interface BookLessonProps {
  learners: BookableLearner[];
  /** Opened from a learner's card, so the first tap is already made. */
  learnerId?: string;
  /** The day the diary is showing, so the second tap usually is too. */
  date?: string;
  label?: string;
  variant?: 'primary' | 'secondary';
}

/**
 * Three taps: who it is for, when it is, and yes (BOK-01, BOK-03, BOK-04). Times outside the
 * instructor's own hours are offered separately, with a warning, because an instructor is
 * allowed to teach outside them and a learner is not (R-04).
 */
export function BookLesson({ learners, learnerId, date, label = 'Book a lesson', variant = 'primary' }: BookLessonProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [learner, setLearner] = useState(learnerId ?? learners[0]?.id ?? '');
  const [day, setDay] = useState(date ?? todayInZone());
  const [lessons, setLessons] = useState<LessonOption[]>([]);
  const [lessonKey, setLessonKey] = useState('');
  const [times, setTimes] = useState<{ asked: string; open: string[]; outOfHours: string[] } | null>(null);
  const [chosenSlot, setChosenSlot] = useState<string | null>(null);
  const [repeat, setRepeat] = useState('1');
  const [clashes, setClashes] = useState<{ startsAt: string; reason: string }[]>([]);

  const chosen = lessons.find((one) => `${one.lessonTypeId}:${String(one.durationMinutes)}` === lessonKey);
  // What the times on screen are for. Changing the day or the length asks again, and the
  // slot picked before is simply not among the answers any more.
  const asked = chosen ? `${day}:${String(chosen.durationMinutes)}` : '';
  const loading = chosen !== undefined && times?.asked !== asked;
  const offered = times === null ? [] : [...times.open, ...times.outOfHours];
  const slot = chosenSlot !== null && offered.includes(chosenSlot) ? chosenSlot : null;
  const outside = slot !== null && (times?.outOfHours.includes(slot) ?? false);

  // What this instructor teaches, once, the first time the sheet is opened.
  useEffect(() => {
    if (!open || lessons.length > 0) return;
    void bookableLessons().then((result) => {
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setLessons(result.data);
      const usual = learners.find((one) => one.id === learner)?.usualDurationMinutes;
      const first = result.data.find((one) => one.durationMinutes === usual) ?? result.data[0];
      // Only if nothing has been chosen while this was on its way: somebody quick off the
      // mark should not have their choice taken back by an answer that arrives after it.
      if (first) setLessonKey((current) => (current === '' ? `${first.lessonTypeId}:${String(first.durationMinutes)}` : current));
    });
  }, [open, lessons.length, learner, learners]);

  // The times on the chosen day, whenever the day or the length changes.
  useEffect(() => {
    if (!open || !chosen || times?.asked === asked) return;
    let current = true;
    void slotsForDay({ date: day, durationMinutes: chosen.durationMinutes }).then((result) => {
      if (!current) return;
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setTimes({ asked, ...result.data });
    });
    return () => {
      current = false;
    };
  }, [open, day, chosen, asked, times?.asked]);

  /** Picking a learner picks the length they usually book, which is usually the right one. */
  const changeLearner = (id: string) => {
    setLearner(id);
    const usual = learners.find((one) => one.id === id)?.usualDurationMinutes;
    const match = lessons.find((one) => one.durationMinutes === usual);
    if (match) setLessonKey(`${match.lessonTypeId}:${String(match.durationMinutes)}`);
  };

  const confirm = () => {
    if (!chosen || slot === null) return;
    setError(null);
    setClashes([]);
    const lesson = {
      learnerId: learner,
      lessonTypeId: chosen.lessonTypeId,
      startsAt: slot,
      durationMinutes: chosen.durationMinutes,
    };

    startTransition(async () => {
      const when = new Date(slot);
      if (repeat === '1') {
        const result = await bookLesson(lesson);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        toast(`Booked for ${formatDate(when)} at ${formatTime(when)}`);
        setOpen(false);
        setChosenSlot(null);
        setTimes(null);
        return;
      }

      const openEnded = repeat === 'open';
      const result = await bookWeekly({ ...lesson, weeks: openEnded ? 4 : Number(repeat), openEnded });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast(
        result.data.booked === 1
          ? `Booked for ${formatDate(when)} at ${formatTime(when)}`
          : `${String(result.data.booked)} lessons booked, ${formatTime(when)} every week`,
      );
      // A week that could not go in stays on screen, because it is the instructor's to sort.
      setClashes(result.data.clashes);
      setTimes(null);
      if (result.data.clashes.length === 0) {
        setOpen(false);
        setChosenSlot(null);
      }
    });
  };

  const grid = (slots: string[], gridLabel: string) => (
    <TimeSlotGrid
      label={gridLabel}
      value={slot}
      onChange={setChosenSlot}
      slots={slots.map((one) => ({ id: one, label: formatTime(new Date(one)) }))}
    />
  );

  return (
    <>
      <Button variant={variant} width="responsive" onClick={() => { setOpen(true); }}>
        <CalendarPlus className="size-5" aria-hidden />
        {label}
      </Button>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Book a lesson"
        description="Who it is for, when it is, and that is it."
        footer={
          <Button
            width="full"
            size="lg"
            pending={pending}
            disabled={slot === null || !chosen}
            onClick={confirm}
          >
            {slot === null || !chosen
              ? 'Choose a time'
              : `Book ${formatTime(new Date(slot))} for ${formatPence(chosen.pricePence)}`}
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          {error ? <FormAlert>{error}</FormAlert> : null}

          <Field label="Who is it for?">
            <Select
              value={learner}
              onChange={(event) => { changeLearner(event.target.value); }}
              options={learners.map((one) => ({ value: one.id, label: one.name }))}
            />
          </Field>

          <Field label="How long?">
            <Select
              value={lessonKey}
              onChange={(event) => { setLessonKey(event.target.value); }}
              options={lessons.map((one) => ({
                value: `${one.lessonTypeId}:${String(one.durationMinutes)}`,
                label: `${one.name}, ${formatMinutes(one.durationMinutes)}, ${formatPence(one.pricePence)}`,
              }))}
            />
          </Field>

          <Field label="How often?">
            <Select value={repeat} onChange={(event) => { setRepeat(event.target.value); }} options={repeats} />
          </Field>

          <Field label="Which day?">
            {/* The browser owns what is in the box; this only listens (D-043). */}
            <Input type="date" defaultValue={day} min={todayInZone()} onChange={(event) => { setDay(event.target.value); }} />
          </Field>

          {loading || times === null ? (
            <Skeleton className="h-28 w-full" />
          ) : times.open.length === 0 && times.outOfHours.length === 0 ? (
            <p className="text-small text-grey-700">
              Nothing free on {formatDate(new Date(`${day}T12:00:00Z`))}. Try another day.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {times.open.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <p className="text-small font-semibold text-ink">Your hours</p>
                  {grid(times.open, `Times on ${formatDate(new Date(`${day}T12:00:00Z`))}`)}
                </div>
              ) : null}
              {times.outOfHours.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <p className="text-small font-semibold text-ink">Outside your hours</p>
                  {grid(times.outOfHours, 'Times outside your hours')}
                </div>
              ) : null}
            </div>
          )}

          {clashes.length > 0 ? (
            <FormAlert tone="warning">
              {clashes.length === 1 ? 'One week could not be booked: ' : `${String(clashes.length)} weeks could not be booked: `}
              {clashes.map((clash) => formatDate(new Date(clash.startsAt))).join(', ')}. The rest are in the diary.
            </FormAlert>
          ) : null}

          {outside ? (
            <FormAlert tone="warning">
              {formatTime(new Date(slot))} is outside the hours you teach. You can still book it.
            </FormAlert>
          ) : null}

          {slot === null ? null : (
            <p className="text-small text-grey-700">
              {learners.find((one) => one.id === learner)?.name ?? 'This learner'} ·{' '}
              {formatDate(new Date(slot))} at {formatTime(new Date(slot))} ·{' '}
              {chosen ? formatMinutes(chosen.durationMinutes) : ''}
              {utcToLocal(new Date(slot)).weekday > 5 ? ' · weekend' : ''}
            </p>
          )}
        </div>
      </Sheet>
    </>
  );
}
