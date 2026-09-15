'use client';

import { todayInZone } from '@repo/core/time';
import { EmptyState } from '@repo/ui/empty-state';
import { CalendarX } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { connectionSnapshot, serverConnectionSnapshot, subscribeToConnection } from '@/lib/offline/connection';
import { keptDay, type KeptDay } from '@/lib/offline/kept-days';
import { readAtLabel, todayView } from '@/lib/offline/today-view';
import { TodayLessons, type TodayLessonsProps } from './today-lessons';

/** Read the phone's copy of the day this often with no signal, so a lesson that ends moves on. */
const everyMinute = 60_000;

/**
 * Today's lessons, with signal or without (PRD 7.5, 8.1, PRG-09, M4-10). With signal, what the
 * server just put together. Without, the phone's own copy of the day and the phone's clock, since
 * the screen itself may be a copy from hours ago, and a line saying when the lessons were read.
 */
export function TodayLessonsLive({ lessons, now }: TodayLessonsProps) {
  const online = useSyncExternalStore(subscribeToConnection, connectionSnapshot, serverConnectionSnapshot);
  const [kept, setKept] = useState<{ day: KeptDay | null; at: Date } | null>(null);

  useEffect(() => {
    if (online) return;
    let live = true;
    const read = () => {
      const at = new Date();
      keptDay(todayInZone(at))
        .then((day) => {
          if (live) setKept({ day, at });
        })
        .catch(() => {
          if (live) setKept({ day: null, at });
        });
    };
    read();
    const ticking = setInterval(read, everyMinute);
    return () => {
      live = false;
      clearInterval(ticking);
    };
  }, [online]);

  const phoneNow = kept?.at ?? new Date(now);
  const view = todayView({ online: online || kept === null, page: { lessons, now }, kept: kept?.day ?? null, phoneNow });

  return (
    <div className="flex flex-col gap-2">
      {view.readAt === null ? null : <p className="text-small text-grey-700">{readAtLabel(view.readAt, phoneNow)}</p>}
      {view.lessons.length === 0 ? (
        <EmptyState
          icon={CalendarX}
          title="No lessons today"
          description="Lessons you book for today show up here, with where to pick each learner up."
        />
      ) : (
        <TodayLessons lessons={view.lessons} now={view.now} plainLinks={!online} />
      )}
    </div>
  );
}
