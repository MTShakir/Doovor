import { lessonsTakenLine, learnerStatusLabels, type LearnerStatus } from '@repo/core/learners';
import { formatDateTime } from '@repo/core/time';
import { Avatar } from '@repo/ui/avatar';
import { StatusPill, type PillStatus } from '@repo/ui/status-pill';
import { MessageSquare, Phone } from 'lucide-react';
import type { LearnerRow as Learner } from '@/lib/learners/list';

/** Learner statuses in the colours PRD 7.4 already gives those meanings. */
const pills: Record<LearnerStatus, PillStatus> = {
  enquiry: 'pending',
  waiting: 'pending',
  active: 'confirmed',
  test_booked: 'test-day',
  passed: 'completed',
  left: 'pending',
};

const action =
  'flex size-12 shrink-0 items-center justify-center rounded-full text-black hover:bg-grey-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-black';

/**
 * One learner, as the list shows them (LRN-01): who they are, where they are up to, and the
 * two things an instructor does from a list. The picture is the first thing to go on a
 * phone, because initials say nothing the name beside them does not.
 */
export function LearnerListRow({ learner }: { learner: Learner }) {
  const details = [
    learner.transmission === null ? null : learner.transmission === 'manual' ? 'Manual' : 'Automatic',
    lessonsTakenLine(learner.lessonsTaken),
    learner.nextLessonAt === null ? null : `Next ${formatDateTime(new Date(learner.nextLessonAt))}`,
  ]
    .filter((part) => part !== null)
    .join(' · ');

  return (
    <article className="flex items-center gap-3 px-4 py-3">
      <Avatar name={learner.fullName} size="md" decorative className="hidden md:inline-flex" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-body font-semibold text-black">{learner.fullName}</span>
          <StatusPill status={pills[learner.status]} className="shrink-0">
            {learnerStatusLabels[learner.status]}
          </StatusPill>
        </span>
        <span className="text-small text-grey-700">{details}</span>
      </span>
      {learner.phone === null ? null : (
        <span className="flex shrink-0 items-center">
          <a href={`tel:${learner.phone}`} aria-label={`Call ${learner.fullName}`} className={action}>
            <Phone className="size-5" aria-hidden />
          </a>
          <a href={`sms:${learner.phone}`} aria-label={`Text ${learner.fullName}`} className={action}>
            <MessageSquare className="size-5" aria-hidden />
          </a>
        </span>
      )}
    </article>
  );
}
