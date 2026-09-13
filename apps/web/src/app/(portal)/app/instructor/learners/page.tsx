import type { Metadata } from 'next';
import { learnerFilterFrom } from '@repo/core/learners';
import { PageHeader } from '@repo/ui/app-shell';
import { Card } from '@repo/ui/card';
import { EmptyState } from '@repo/ui/empty-state';
import { ListDivider } from '@repo/ui/list-row';
import { SkeletonRow } from '@repo/ui/skeleton';
import { Users } from 'lucide-react';
import { Fragment, Suspense } from 'react';
import { requirePortal } from '@/lib/auth/session';
import { listLearners } from '@/lib/learners/list';
import { LearnerBrowser } from './learner-browser';
import { LearnerListRow } from './learner-row';

export const metadata: Metadata = { title: 'Learners' };

interface LearnersPageProps {
  searchParams: Promise<{ q?: string; status?: string }>;
}

export default function LearnersPage({ searchParams }: LearnersPageProps) {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader title="Learners" subtitle="The people you teach." />
      <div className="flex flex-col gap-4 px-4 md:px-8">
        <Suspense fallback={<SkeletonRow />}>
          <Learners searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

/** LRN-01: everyone this instructor teaches, with the two things a list is for. */
async function Learners({ searchParams }: LearnersPageProps) {
  const params = await searchParams;
  const filter = learnerFilterFrom(params.status);
  const search = params.q ?? '';

  const { access } = await requirePortal('instructor');
  const membership = access.memberships.find((one) => one.instructorProfileId !== null);
  if (!membership?.instructorProfileId) return null;

  const learners = await listLearners({
    businessId: membership.businessId,
    instructorProfileId: membership.instructorProfileId,
    filter,
    search,
  });
  const searching = search.trim() !== '' || filter !== 'all';

  return (
    <LearnerBrowser search={search} filter={filter} total={learners.length}>
      {learners.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={Users}
            title={searching ? 'Nobody matches' : 'No learners yet'}
            description={
              searching
                ? 'Try another spelling, or a different filter.'
                : 'Invite a learner and they will appear here as soon as they accept.'
            }
          />
        </Card>
      ) : (
        <Card padding="none">
          {learners.map((learner, index) => (
            <Fragment key={learner.id}>
              {index === 0 ? null : <ListDivider />}
              <LearnerListRow learner={learner} />
            </Fragment>
          ))}
        </Card>
      )}
    </LearnerBrowser>
  );
}
