'use client';

import { todayInZone } from '@repo/core/time';
import { EmptyState } from '@repo/ui/empty-state';
import { CalendarX } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { KeptRecordsNotice } from '@/components/offline/kept-records-notice';
import { connectionSnapshot, serverConnectionSnapshot, subscribeToConnection } from '@/lib/offline/connection';
import { keptDay, keptOwner, type KeptDay } from '@/lib/offline/kept-days';
import { outboxFor, removeFromOutbox, type OutboxRecord } from '@/lib/offline/outbox';
import { outboxChannel } from '@/lib/offline/send-kept-records';
import { readAtLabel, todayView } from '@/lib/offline/today-view';
import { TodayLessons, type TodayLessonsProps } from './today-lessons';

/** Read the phone's copy of the day this often with no signal, so a lesson that ends moves on. */
const everyMinute = 60_000;

/**
 * Today's lessons, with signal or without (PRD 7.5, 8.1, PRG-09, M4-10, M4-11). With signal, what
 * the server just put together. Without, the phone's own copy of the day and the phone's clock,
 * since the screen itself may be a copy from hours ago, and a line saying when the lessons were read.
 * Either way, the records saved on the phone and not sent yet: a lesson whose record is waiting is
 * as good as recorded, and one the server turned down says why.
 */
export function TodayLessonsLive({ lessons, now }: TodayLessonsProps) {
  const router = useRouter();
  const online = useSyncExternalStore(subscribeToConnection, connectionSnapshot, serverConnectionSnapshot);
  const [kept, setKept] = useState<{ day: KeptDay | null; at: Date } | null>(null);
  const [outbox, setOutbox] = useState<OutboxRecord[]>([]);

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

  useEffect(() => {
    let live = true;
    const read = () => {
      keptOwner()
        .then((owner) => (owner === null ? [] : outboxFor(owner)))
        .then((records) => {
          if (live) setOutbox(records);
        })
        .catch(() => undefined);
    };
    read();
    // A record sent, or turned down, from this page, another tab or the service worker.
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(outboxChannel);
    if (channel !== null) {
      channel.onmessage = () => {
        read();
        // What was sent is recorded now: with signal, the lessons can say so.
        if (navigator.onLine) router.refresh();
      };
    }
    return () => {
      live = false;
      channel?.close();
    };
  }, [router]);

  const dismiss = (id: string) => {
    setOutbox((records) => records.filter((one) => one.id !== id));
    removeFromOutbox(id).catch(() => undefined);
  };

  const phoneNow = kept?.at ?? new Date(now);
  const view = todayView({ online: online || kept === null, page: { lessons, now }, kept: kept?.day ?? null, phoneNow });
  const waiting = new Set(outbox.filter((one) => one.state === 'waiting').map((one) => one.bookingId));

  return (
    <div className="flex flex-col gap-2">
      <KeptRecordsNotice records={outbox} onDismiss={dismiss} />
      {view.readAt === null ? null : <p className="text-small text-grey-700">{readAtLabel(view.readAt, phoneNow)}</p>}
      {view.lessons.length === 0 ? (
        <EmptyState
          icon={CalendarX}
          title="No lessons today"
          description="Lessons you book for today show up here, with where to pick each learner up."
        />
      ) : (
        <TodayLessons lessons={view.lessons} now={view.now} plainLinks={!online} waiting={waiting} />
      )}
    </div>
  );
}
