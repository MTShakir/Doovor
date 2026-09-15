import type { Metadata } from 'next';
import { todayInZone } from '@repo/core/time';
import { PageHeader } from '@repo/ui/app-shell';
import { SkeletonRow } from '@repo/ui/skeleton';
import { Suspense } from 'react';
import { ProgressLayout } from '@/components/progress/progress-layout';
import { RecordTimeline } from '@/components/progress/record-timeline';
import { SkillMap } from '@/components/progress/skill-map';
import { requirePortal } from '@/lib/auth/session';
import { learnerSkillMap, lessonRecordPage } from '@/lib/lessons/records';

export const metadata: Metadata = { title: 'Progress' };

export default function ProgressPage() {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader title="Progress" subtitle="What each lesson covered, and where you are with each part of the test." />
      <div className="px-4 md:px-8 lg:max-w-5xl">
        <Suspense fallback={<SkeletonRow />}>
          <Progress />
        </Suspense>
      </div>
    </main>
  );
}

/** PRG-03, M4-06, M4-07: the learner's lesson records and skill map, from every Business they learn with. */
async function Progress() {
  const { session } = await requirePortal('learner');
  const [first, progress] = await Promise.all([lessonRecordPage(session.userId), learnerSkillMap(session.userId)]);

  return (
    <ProgressLayout
      records={
        <RecordTimeline
          learnerId={session.userId}
          first={first}
          thisYear={todayInZone().slice(0, 4)}
          empty={{
            title: 'No lesson records yet',
            description: 'After each lesson your instructor writes down what you covered and how it went, and it shows here.',
          }}
        />
      }
      skills={<SkillMap progress={progress} />}
    />
  );
}
