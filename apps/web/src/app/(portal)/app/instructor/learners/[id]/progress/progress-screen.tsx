import { todayInZone } from '@repo/core/time';
import { PageHeader } from '@repo/ui/app-shell';
import { SkeletonRow } from '@repo/ui/skeleton';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import type { LessonPortal } from '@/components/lessons/lesson-details';
import { EditableSkillMap } from '@/components/progress/editable-skill-map';
import { ProgressLayout } from '@/components/progress/progress-layout';
import { RecordTimeline } from '@/components/progress/record-timeline';
import { SkillMap } from '@/components/progress/skill-map';
import { requirePortal } from '@/lib/auth/session';
import { learnerCard } from '@/lib/learners/card';
import { learnerSkillMap, lessonRecordPage } from '@/lib/lessons/records';
import { rateSkill } from './actions';

export interface ProgressScreenProps {
  params: Promise<{ id: string }>;
  /**
   * The instructor's, who rates the skills, or the school office's, which reads them: writing a
   * lesson's record is the instructor's alone (PRD 6.2, D-330).
   */
  portal: LessonPortal;
}

export function ProgressScreen({ params, portal }: ProgressScreenProps) {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <Suspense fallback={<SkeletonRow />}>
        <LearnerProgress params={params} portal={portal} />
      </Suspense>
    </main>
  );
}

/**
 * PRG-03, M4-07, PRD 6.2 "View learner progress": one learner's lesson records and skill map, made
 * of the records the instructor, or the people who run the school, may read where they are taught.
 */
async function LearnerProgress({ params, portal }: ProgressScreenProps) {
  const { id } = await params;
  const { access } = await requirePortal(portal);

  // Somebody who may not see the learner has no card, and so no progress to look at.
  const card = await learnerCard(id);
  if (!card) notFound();
  const runsIt = access.memberships.some((one) => one.businessId === card.businessId && (one.role === 'owner' || one.role === 'manager'));
  if (portal === 'school' && !runsIt) notFound();

  const [first, progress] = await Promise.all([lessonRecordPage(card.learnerId), learnerSkillMap(card.learnerId)]);
  const firstName = card.fullName.split(' ')[0] ?? card.fullName;

  return (
    <>
      <PageHeader
        title="Progress"
        back={
          <Link
            href={`/app/${portal}/learners/${card.learnerId}`}
            className="-ml-3 flex h-12 w-fit items-center gap-1 rounded-full px-3 text-body font-medium text-ink hover:bg-grey-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
          >
            <ChevronLeft size={20} strokeWidth={1.5} aria-hidden />
            {card.fullName}
          </Link>
        }
      />
      <div className="px-4 md:px-8 lg:max-w-5xl">
        <ProgressLayout
          records={
            <RecordTimeline
              learnerId={card.learnerId}
              first={first}
              thisYear={todayInZone().slice(0, 4)}
              empty={{
                title: 'No lesson records yet',
                description:
                  portal === 'school'
                    ? `${firstName}'s instructor writes one after each lesson.`
                    : `Write one after ${firstName}'s next lesson: tap Done in the diary, or Write record on Today.`,
              }}
            />
          }
          skills={
            portal === 'school' ? (
              <SkillMap progress={progress} />
            ) : (
              <EditableSkillMap learnerId={card.learnerId} learnerName={card.fullName} progress={progress} save={rateSkill} />
            )
          }
        />
      </div>
    </>
  );
}
