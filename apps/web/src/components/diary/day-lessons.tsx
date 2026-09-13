'use client';

import { formatMinutes, formatTime } from '@repo/core/time';
import { toast } from '@repo/ui/toast';
import { useRef, useState, useTransition } from 'react';
import { completeLesson, markNoShow, moveLesson } from '@/app/(portal)/app/instructor/booking-actions';
import type { DiaryEntry } from '@/lib/diary/lessons';
import { LessonRow } from './lesson-row';
import { LessonSheets } from './lesson-sheets';

export interface DayGap {
  startsAt: Date;
  endsAt: Date;
  minutes: number;
}

export interface DayLessonsProps {
  lessons: DiaryEntry[];
  gaps: DayGap[];
  /** The moment the page was rendered, so the server and the browser agree on what is past. */
  now: Date;
  showInstructor?: boolean;
  canAnswer?: boolean;
  rules?: { cancellationWindowHours: number; lateFeePercent: number };
}

/** How long to hold a lesson on a phone before it offers to move (PRD 7.1, BOK-08). */
const HOLD_MS = 500;

/**
 * The lessons of one day, and the two ways to move one (DIA-03, BOK-08, M2-24): drag it
 * into a gap with a mouse, or hold it on a phone and pick a time.
 *
 * A dragged lesson moves on screen before the server has agreed, and moves back if the
 * server says no, because a diary that waits half a second to redraw feels broken.
 */
export function DayLessons({ lessons, gaps, now, showInstructor = false, canAnswer = false, rules }: DayLessonsProps) {
  const [, startTransition] = useTransition();
  const [moved, setMoved] = useState<Record<string, Date>>({});
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [sheet, setSheet] = useState<{ id: string; action: 'move' | 'cancel' } | null>(null);
  const holding = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shown = lessons.map((lesson) => {
    const to = moved[lesson.id];
    if (!to) return lesson;
    const length = lesson.endsAt.getTime() - lesson.startsAt.getTime();
    return { ...lesson, startsAt: to, endsAt: new Date(to.getTime() + length) };
  });
  const chosen = shown.find((lesson) => lesson.id === sheet?.id);
  const gapAfter = new Map(gaps.map((gap) => [gap.startsAt.getTime(), gap]));

  const drop = (lessonId: string, at: Date) => {
    setDragging(null);
    setOver(null);
    // On screen at once; back where it was if the server will not have it.
    setMoved((current) => ({ ...current, [lessonId]: at }));
    startTransition(async () => {
      const result = await moveLesson({ bookingId: lessonId, startsAt: at.toISOString() });
      if (result.ok) {
        toast(`Moved to ${formatTime(at)}`);
        return;
      }
      // Back where it was: the server would not have it there.
      setMoved((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== lessonId)));
      toast(result.message);
    });
  };

  const after = (what: 'done' | 'no show', run: () => Promise<{ ok: boolean; message?: string }>) => {
    startTransition(async () => {
      const result = await run();
      toast(result.ok ? `Marked as ${what}` : (result.message ?? 'That did not work'));
    });
  };

  const hold = (lessonId: string, pointer: string) => {
    // A mouse drags a lesson; a finger holds it. Arming the hold for both means a slow drag
    // opens the sheet halfway through.
    if (pointer === 'mouse') return;
    holding.current = setTimeout(() => { setSheet({ id: lessonId, action: 'move' }); }, HOLD_MS);
  };
  const letGo = () => {
    if (holding.current) clearTimeout(holding.current);
    holding.current = null;
  };

  return (
    <>
      <ul className="divide-y divide-grey-200 rounded-card border border-grey-200 bg-white">
        {shown.map((lesson) => {
          const gap = gapAfter.get(lesson.endsAt.getTime());
          const movable = canAnswer && lesson.facts.status !== 'cancelled';
          return (
            <li key={lesson.id}>
              <div
                draggable={movable}
                onDragStart={() => { setDragging(lesson.id); }}
                onDragEnd={() => { setDragging(null); setOver(null); }}
                onPointerDown={movable ? (event) => { hold(lesson.id, event.pointerType); } : undefined}
                onPointerUp={letGo}
                onPointerCancel={letGo}
                onPointerMove={letGo}
                className={dragging === lesson.id ? 'opacity-50' : undefined}
              >
                <LessonRow
                  lesson={lesson}
                  showInstructor={showInstructor}
                  canAnswer={canAnswer}
                  onMove={rules ? () => { setSheet({ id: lesson.id, action: 'move' }); } : undefined}
                  onCancel={rules ? () => { setSheet({ id: lesson.id, action: 'cancel' }); } : undefined}
                  started={lesson.startsAt.getTime() <= now.getTime()}
                  canMarkNoShow={now.getTime() >= lesson.startsAt.getTime() + 15 * 60_000}
                  onComplete={() => { after('done', () => completeLesson({ bookingId: lesson.id })); }}
                  onNoShow={() => { after('no show', () => markNoShow({ bookingId: lesson.id })); }}
                />
              </div>
              {gap ? (
                <p
                  onDragOver={(event) => {
                    if (dragging === null) return;
                    event.preventDefault();
                    setOver(gap.startsAt.getTime());
                  }}
                  onDragLeave={() => { setOver(null); }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (dragging !== null) drop(dragging, gap.startsAt);
                  }}
                  className={`border-t border-dashed px-4 py-2 text-small ${
                    over === gap.startsAt.getTime()
                      ? 'border-black bg-yellow font-semibold text-black'
                      : 'border-grey-200 bg-grey-100 text-grey-700'
                  }`}
                >
                  {dragging === null
                    ? `Free until ${formatTime(gap.endsAt)}, ${formatMinutes(gap.minutes).toLowerCase()}`
                    : `Drop here to move it to ${formatTime(gap.startsAt)}`}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      {chosen && rules ? (
        <LessonSheets
          lesson={{
            bookingId: chosen.id,
            learnerName: chosen.learnerName,
            startsAt: chosen.startsAt.toISOString(),
            durationMinutes: Math.round((chosen.endsAt.getTime() - chosen.startsAt.getTime()) / 60_000),
            pricePence: chosen.pricePence,
          }}
          rules={rules}
          action={sheet?.action ?? 'move'}
          onClose={() => { setSheet(null); }}
        />
      ) : null}
    </>
  );
}
