'use client';

import { Button } from '@repo/ui/button';
import { EmptyState } from '@repo/ui/empty-state';
import { NotebookPen } from 'lucide-react';
import { useState } from 'react';
import { FormAlert } from '@/components/form-alert';
import type { RecordPage, RecordedLesson } from '@/lib/lessons/records';
import { LessonRecordCard } from './lesson-record-card';

interface RecordTimelineProps {
  learnerId: string;
  /** The first page, read on the server. */
  first: RecordPage;
  /** The year it is in London, so only a lesson in another year says which. */
  thisYear: string;
  /** What to say when there are no records yet, which depends on who is reading. */
  empty: { title: string; description: string };
}

/**
 * A learner's lesson records, the latest lesson first (PRG-03, M4-06). The first page comes with
 * the screen; each older page is added under it from the records route, so the place being read
 * stays where it is.
 */
export function RecordTimeline({ learnerId, first, thisYear, empty }: RecordTimelineProps) {
  const [records, setRecords] = useState<RecordedLesson[]>(first.records);
  const [next, setNext] = useState(first.next);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  if (records.length === 0) {
    return (
      <div className="rounded-card border border-grey-200 bg-white">
        <EmptyState icon={NotebookPen} title={empty.title} description={empty.description} />
      </div>
    );
  }

  const showOlder = async (before: string) => {
    setLoading(true);
    setFailed(false);
    try {
      const response = await fetch(`/api/v1/lesson-records?${new URLSearchParams({ learner: learnerId, before }).toString()}`, {
        headers: { accept: 'application/json' },
      });
      const body = (await response.json()) as { ok: true; data: RecordPage } | { ok: false };
      if (!body.ok) throw new Error('Older records were not sent');
      setRecords((shown) => [...shown, ...body.data.records]);
      setNext(body.data.next);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <ol aria-label="Lesson records" className="flex flex-col gap-4">
        {records.map((record) => (
          <li key={record.id}>
            <LessonRecordCard record={record} thisYear={thisYear} />
          </li>
        ))}
      </ol>
      {failed ? <FormAlert>Older records did not load. Check your signal and try again.</FormAlert> : null}
      {next === null ? null : (
        <Button variant="secondary" width="responsive" pending={loading} onClick={() => void showOlder(next)}>
          Show older records
        </Button>
      )}
    </div>
  );
}
