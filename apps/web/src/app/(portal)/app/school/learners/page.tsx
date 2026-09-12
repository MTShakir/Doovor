import type { Metadata } from 'next';
import { learnerFilterFrom } from '@repo/core/learners';
import { PageHeader } from '@repo/ui/app-shell';
import { Card } from '@repo/ui/card';
import { EmptyState } from '@repo/ui/empty-state';
import { ListDivider } from '@repo/ui/list-row';
import { SkeletonRow } from '@repo/ui/skeleton';
import { Users } from 'lucide-react';
import { Fragment, Suspense } from 'react';
import { LearnerBrowser } from '@/app/(portal)/app/instructor/learners/learner-browser';
import { requirePortal } from '@/lib/auth/session';
import { listLearners } from '@/lib/learners/list';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { SchoolLearnerRow } from './school-learner-row';

export const metadata: Metadata = { title: 'Learners' };

interface SchoolLearnersProps {
  searchParams: Promise<{ q?: string; status?: string }>;
}

export default function SchoolLearnersPage({ searchParams }: SchoolLearnersProps) {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader title="Learners" subtitle="Everybody the school teaches." />
      <div className="flex flex-col gap-4 px-4 md:px-8">
        <Suspense fallback={<SkeletonRow />}>
          <Learners searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

/** LRN-01 and LRN-06: the school's whole list, and who teaches each of them. */
async function Learners({ searchParams }: SchoolLearnersProps) {
  const params = await searchParams;
  const filter = learnerFilterFrom(params.status);
  const search = params.q ?? '';

  const { access } = await requirePortal('school');
  const membership = access.memberships.find((one) => one.businessType === 'school');
  if (!membership) return null;

  const supabase = await createSupabaseServerClient();
  const [learners, team] = await Promise.all([
    listLearners({ businessId: membership.businessId, filter, search }),
    supabase
      .from('instructor_profiles')
      .select('id, display_name')
      .eq('business_id', membership.businessId)
      .order('display_name'),
  ]);
  const instructors = (team.data ?? []).map((one) => ({ id: one.id, name: one.display_name }));
  const searching = search.trim() !== '' || filter !== 'all';

  return (
    <LearnerBrowser search={search} filter={filter} total={learners.length} path="/app/school/learners" canAdd={false}>
      <Card padding="none">
        {learners.length === 0 ? (
          <EmptyState
            icon={Users}
            title={searching ? 'Nobody matches' : 'No learners yet'}
            description={
              searching
                ? 'Try another spelling, or a different filter.'
                : 'Learners appear here as your instructors add them.'
            }
          />
        ) : (
          learners.map((learner, index) => (
            <Fragment key={learner.id}>
              {index === 0 ? null : <ListDivider />}
              <SchoolLearnerRow learner={learner} instructors={instructors} />
            </Fragment>
          ))
        )}
      </Card>
    </LearnerBrowser>
  );
}
