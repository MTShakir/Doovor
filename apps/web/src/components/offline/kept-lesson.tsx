'use client';

import { Button } from '@repo/ui/button';
import { EmptyState } from '@repo/ui/empty-state';
import { SkeletonRow } from '@repo/ui/skeleton';
import { CloudOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { LessonScreen } from '@/components/lessons/lesson-screen';
import { connectionSnapshot, serverConnectionSnapshot, subscribeToConnection } from '@/lib/offline/connection';
import { keptLesson, type KeptLesson } from '@/lib/offline/kept-days';

type Found = { state: 'reading' } | { state: 'missing' } | { state: 'found'; lesson: KeptLesson; ended: boolean };

function subscribeToAddress(listener: () => void): () => void {
  window.addEventListener('popstate', listener);
  return () => {
    window.removeEventListener('popstate', listener);
  };
}

/**
 * The address as the phone shows it. The copy of this screen was kept without a lesson in its
 * address, and the app's search params describe the copy, so the lesson is read from the address
 * bar itself; on the server it is not known yet.
 */
const addressSearch = () => window.location.search;
const noAddressYet = () => null;

/**
 * A lesson drawn from the phone's copy of today and tomorrow, for where there is no signal and its
 * own screen was never opened with one (PRG-09, PRD 8.1, M4-10). The service worker sends a lesson
 * here; with signal back, the lesson's own screen takes over, and what was typed carries across,
 * since the draft is kept under the lesson on the phone.
 */
export function KeptLessonScreen() {
  const router = useRouter();
  const search = useSyncExternalStore(subscribeToAddress, addressSearch, noAddressYet);
  const params = new URLSearchParams(search ?? '');
  const id = params.get('lesson');
  const onRecord = params.get('record') === '1';
  const online = useSyncExternalStore(subscribeToConnection, connectionSnapshot, serverConnectionSnapshot);
  const [found, setFound] = useState<Found>({ state: 'reading' });

  useEffect(() => {
    if (id === null) return;
    let live = true;
    keptLesson(id)
      .then((lesson) => {
        if (!live) return;
        setFound(lesson === null ? { state: 'missing' } : { state: 'found', lesson, ended: new Date(lesson.endsAt).getTime() <= Date.now() });
      })
      .catch(() => {
        if (live) setFound({ state: 'missing' });
      });
    return () => {
      live = false;
    };
  }, [id]);

  // With signal, the lesson's own screen, which knows more than the phone's copy.
  useEffect(() => {
    if (online && id !== null) router.replace(`/app/instructor/lessons/${id}${onRecord ? '?record=1' : ''}`);
  }, [online, id, onRecord, router]);

  if (search === null || (id !== null && found.state === 'reading')) {
    return (
      <div className="px-4 pt-4 md:px-8">
        <SkeletonRow />
      </div>
    );
  }
  if (id === null || found.state !== 'found') {
    return (
      <EmptyState
        icon={CloudOff}
        title="This lesson is not on this phone"
        description="Today's and tomorrow's lessons are kept when Today opens with signal. Open it again once you have some."
        action={
          <Button asChild width="full">
            <a href="/app/instructor">Back to Today</a>
          </Button>
        }
      />
    );
  }

  const { lesson, ended } = found;
  return <LessonScreen lesson={lesson} startOnRecord={onRecord || lesson.facts.status === 'completed' || ended} />;
}
