'use client';

import { lessonState, lessonStateLabel } from '@repo/core/diary';
import { formatDateTime, formatMinutes } from '@repo/core/time';
import { Card } from '@repo/ui/card';
import { ListDivider, ListRow } from '@repo/ui/list-row';
import { StatusPill } from '@repo/ui/status-pill';
import { Fragment, useState } from 'react';
import { LessonDetailsSheet, type LessonPortal } from '@/components/lessons/lesson-details';

/** What a row needs. The same fields as `LearnerLesson`, said here so this stays a client file. */
export interface LessonRow {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  paymentStatus: string;
  creditMinutes: number;
  /** A request the instructor turned down, whose status is cancelled (D-340). */
  declined: boolean;
  lessonType: string;
  instructorName: string;
}

/**
 * This learner's lessons with this Business, under the Lessons tab (LRN-02, D-189, D-214).
 *
 * Every row opens the lesson's own sheet, the same one the diary and Today open (D-166). It used
 * to be a list that could not be tapped, which taught the opposite of every other lesson in the
 * product and left the pickup, the learner's number and Mark paid a screen away.
 */
export function LessonRows({
  lessons,
  label,
  empty,
  learnerName,
  portal = 'instructor',
}: {
  lessons: LessonRow[];
  label: string;
  empty: string;
  learnerName: string;
  /** The instructor's card, or the school office's (D-330). */
  portal?: LessonPortal;
}) {
  const [open, setOpen] = useState<LessonRow | null>(null);
  if (lessons.length === 0) return <p className="px-1 text-small text-grey-700">{empty}</p>;

  return (
    <>
      <Card padding="none" role="region" aria-label={label}>
        {lessons.map((lesson, index) => {
          const facts = {
            status: lesson.status as never,
            paymentStatus: lesson.paymentStatus as never,
            kind: 'standard' as const,
            creditMinutes: lesson.creditMinutes,
            declined: lesson.declined,
          };
          const minutes = Math.round((new Date(lesson.endsAt).getTime() - new Date(lesson.startsAt).getTime()) / 60_000);
          const when = formatDateTime(new Date(lesson.startsAt));
          return (
            <Fragment key={lesson.id}>
              {index === 0 ? null : <ListDivider />}
              <ListRow
                asChild
                title={when}
                subtitle={`${lesson.lessonType}, ${formatMinutes(minutes)}, with ${lesson.instructorName}`}
                trailing={<StatusPill status={lessonState(facts)}>{lessonStateLabel(facts)}</StatusPill>}
                chevron
              >
                <button type="button" aria-label={`Open ${when}`} onClick={() => { setOpen(lesson); }} />
              </ListRow>
            </Fragment>
          );
        })}
      </Card>
      {open === null ? null : (
        <LessonDetailsSheet
          lesson={{
            id: open.id,
            startsAt: open.startsAt,
            endsAt: open.endsAt,
            learnerName,
            lessonType: open.lessonType,
          }}
          // The card they would be sent to is the one they are on.
          onCard
          portal={portal}
          onClose={() => { setOpen(null); }}
        />
      )}
    </>
  );
}
