import { formatDate } from '@repo/core/time';
import { PageHeader } from '@repo/ui/app-shell';
import { Button } from '@repo/ui/button';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { InstallPrompt } from '@/components/pwa/install-prompt';
import { InstructorWeeks, OverviewFigures, OverviewSkeleton } from '@/components/school/overview';
import { requirePortal } from '@/lib/auth/session';
import { schoolOverview } from '@/lib/school/overview';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Overview' };

/** SCH-01, PRD 10.5 step 5: how the school is doing, the first thing its owner sees. */
export default function SchoolOverviewPage() {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader title="Overview" subtitle="How the school is doing today, this week and this month." />
      <div className="flex flex-col gap-4 px-4 md:px-8 lg:max-w-5xl">
        <Suspense fallback={<OverviewSkeleton />}>
          <Overview />
        </Suspense>
        <InstallPrompt why="The school's diary, instructors and learners, one tap away." />
      </div>
    </main>
  );
}

async function Overview() {
  const { access } = await requirePortal('school');
  const membership = access.memberships.find(
    (one) => one.businessType === 'school' && (one.role === 'owner' || one.role === 'manager'),
  );
  if (!membership) return null;

  const now = new Date();
  const supabase = await createSupabaseServerClient();
  const [overview, { count: prices }] = await Promise.all([
    schoolOverview(membership.businessId, now),
    supabase.from('lesson_prices').select('id', { count: 'exact', head: true }).eq('business_id', membership.businessId),
  ]);
  return (
    <>
      {/* A school is not asked its prices when it signs up, and until it sets them nothing can be
          booked with its instructors, so the Overview says so first (PRD 10.5, D-329). */}
      {prices === 0 ? (
        <Card className="flex flex-col gap-3" role="region" aria-labelledby="set-prices-title">
          <div className="flex flex-col gap-1">
            <CardTitle id="set-prices-title">Set your prices</CardTitle>
            <CardDescription>Nothing can be booked with your instructors until you do. It takes a minute.</CardDescription>
          </div>
          <Button asChild width="responsive">
            <Link href="/app/school/settings">Set your prices</Link>
          </Button>
        </Card>
      ) : null}
      <OverviewFigures overview={overview} today={formatDate(now)} />
      <InstructorWeeks instructors={overview.utilisation.instructors} week={overview.week} />
    </>
  );
}
