'use client';

import { formatElapsed } from '@repo/core/lesson-records';
import { Button } from '@repo/ui/button';
import { Play, Timer } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { draftSnapshot, parseDraft, subscribeToDrafts } from '@/lib/lessons/draft';

/**
 * How long a lesson has been running on this phone (PRD 7.5, D-184), or null when it has not been
 * started. The clock is read after the screen is on, never while it is drawn, because Today is
 * built ahead of time and a component that asks what the time is cannot be.
 */
export function useLessonRunning(bookingId: string): number | null {
  const text = useSyncExternalStore(subscribeToDrafts, () => draftSnapshot(bookingId), () => null);
  const startedAt = parseDraft(text)?.startedAt ?? null;
  const [seconds, setSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (startedAt === null) return undefined;
    const tick = () => { setSeconds(Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 1000))); };
    // Not while the effect runs: a lesson's card is drawn before the phone is allowed a clock.
    const atOnce = setTimeout(tick, 0);
    const every = setInterval(tick, 1000);
    return () => {
      clearTimeout(atOnce);
      clearInterval(every);
    };
  }, [startedAt]);

  return startedAt === null ? null : seconds;
}

/**
 * The big button on a lesson that is about to be taught (PRD 7.5, D-178, D-184): Start lesson
 * until it is started, and from then on how long it has been running, which opens it again.
 *
 * The same button serves the card on Today and the lesson's own sheet, so an instructor who opens
 * a lesson to look at the pickup can start it from there without going back.
 */
export function StartLessonButton({ bookingId, plainLinks = false }: { bookingId: string; plainLinks?: boolean }) {
  const running = useLessonRunning(bookingId);
  const Go = plainLinks ? 'a' : Link;
  const href = `/app/instructor/lessons/${bookingId}` as Route;

  if (running === null) {
    return (
      <Button asChild>
        <Go href={href}>
          <Play className="size-5" aria-hidden />
          Start lesson
        </Go>
      </Button>
    );
  }

  return (
    <Button asChild>
      <Go href={href}>
        <Timer className="size-5" aria-hidden />
        Lesson running
        <span className="tabular-nums">{formatElapsed(running)}</span>
      </Go>
    </Button>
  );
}
