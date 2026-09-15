import type { Metadata } from 'next';
import { todayInZone } from '@repo/core/time';
import { PageHeader } from '@repo/ui/app-shell';
import { SkeletonRow } from '@repo/ui/skeleton';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { ProgressLayout } from '@/components/progress/progress-layout';
import { RecordTimeline } from '@/components/progress/record-timeline';
import { SkillMap } from '@/components/progress/skill-map';
import { requirePortal } from '@/lib/auth/session';
import { learnerCard } from '@/lib/learners/card';
import { learnerSkillMap, lessonRecordPage } from '@/lib/lessons/records';

export const metadata: Metadata = { title: 'Progress' };

interface LearnerProgressPageProps {
  params: Promise<{ id: string }>;
}

export default function LearnerProgressPage({ params }: LearnerProgressPageProps) {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <Suspense fallback={<SkeletonRow />}>
        <LearnerProgress params={params} />
      </Suspense>
    </main>
  );
}

/**
 * PRG-03, M4-07, PRD 6.2 "View learner progress: own learners": one learner's lesson records and
 * skill map, made of the records the instructor may read where they teach them.
 */
async function LearnerProgress({ params }: LearnerProgressPageProps) {
  const { id } = await params;
  await requirePortal('instructor');

  // Somebody who may not see the learner has no card, and so no progress to look at.
  const card = await learnerCard(id);
  if (!card) notFound();

  const [first, progress] = await Promise.all([lessonRecordPage(card.learnerId), learnerSkillMap(card.learnerId)]);
  const firstName = card.fullName.split(' ')[0] ?? card.fullName;

  return (
    <>
      <PageHeader
        title="Progress"
        back={
          <Link
            href={`/app/instructor/learners/${card.learnerId}`}
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
                description: `Write one after ${firstName}'s next lesson: tap Done in the diary, or Write record on Today.`,
              }}
            />
          }
          skills={<SkillMap progress={progress} />}
        />
      </div>
    </>
  );
}
