import { lessonsTakenLine, learnerStatusLabels } from '@repo/core/learners';
import { formatDateTime } from '@repo/core/time';
import { Avatar } from '@repo/ui/avatar';
import { StatusPill } from '@repo/ui/status-pill';
import { MessageSquare, Phone } from 'lucide-react';
import Link from 'next/link';
import type { LearnerRow as Learner } from '@/lib/learners/list';
import { statusPill } from '@/lib/learners/status-pill';

const action =
  'relative flex size-12 shrink-0 items-center justify-center rounded-full text-black hover:bg-grey-200 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-black';

/**
 * One learner, as the list shows them (LRN-01): who they are, where they are up to, and the
 * two things an instructor does from a list. The name covers the whole row, so the row opens
 * their card, while calling and texting stay their own controls on top of it.
 *
 * The picture is the first thing to go on a phone, because initials say nothing the name
 * beside them does not.
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
    <article className="relative flex items-center gap-3 px-4 py-3 transition-colors duration-200 hover:bg-grey-100 focus-within:bg-grey-100">
      <Avatar name={learner.fullName} size="md" decorative className="hidden md:inline-flex" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-2">
          <Link
            href={`/app/instructor/learners/${learner.learnerId}`}
            className="truncate text-body font-semibold text-black after:absolute after:inset-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-black"
          >
            {learner.fullName}
          </Link>
          <StatusPill status={statusPill(learner.status)} className="shrink-0">
            {learnerStatusLabels[learner.status]}
          </StatusPill>
        </span>
        <span className="text-small text-grey-700">{details}</span>
      </span>
      {learner.phone === null ? null : (
        <span className="relative flex shrink-0 items-center">
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
