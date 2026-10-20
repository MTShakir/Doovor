import { brand } from '@repo/config/brand';
import { PageHeader } from '@repo/ui/app-shell';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { EmptyState } from '@repo/ui/empty-state';
import { SkeletonRow } from '@repo/ui/skeleton';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { requirePortal } from '@/lib/auth/session';
import { icons } from '@/lib/icons';
import { ownSchoolLink } from '@/lib/school/link';
import { LeaveSchool } from './leave-school';

export const metadata: Metadata = { title: 'Your school' };

/** D-282: the school an instructor's own business is linked to, what that means, and the way out. */
export default function InstructorSchoolPage() {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader title="Your school" subtitle="The driving school that sends you pupils." />
      <div className="flex flex-col gap-4 px-4 md:max-w-2xl md:px-8">
        <Suspense fallback={<SkeletonRow />}>
          <School />
        </Suspense>
      </div>
    </main>
  );
}

async function School() {
  await requirePortal('instructor');
  const linked = await ownSchoolLink();

  if (linked === null) {
    return (
      <Card>
        <EmptyState
          icon={icons.school}
          title="You are not linked to a school"
          description="A driving school that sends pupils to instructors with their own business can send you a link to join it. You keep your own prices, payments and learners."
        />
      </Card>
    );
  }

  const { link, businessName } = linked;
  return (
    <Card className="flex flex-col gap-4" role="region" aria-labelledby="your-school-title">
      <div className="flex flex-col gap-1">
        <CardTitle id="your-school-title">{link.schoolName}</CardTitle>
        <CardDescription>
          {businessName} has been linked since {link.linkedOn}.
        </CardDescription>
      </div>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-body text-ink">
        <li>Your prices, payments and learners are yours, as they were.</li>
        <li>{link.schoolName} sends you pupils and sees when you are free, never your money.</li>
        <li>{link.schoolName} vouches for your badge, so {brand.name} does not check it while you are linked.</li>
        {link.proGiven ? <li>Your plan includes Pro while you are linked, paid for by {link.schoolName}.</li> : null}
      </ul>
      <LeaveSchool linkId={link.linkId} school={link.schoolName} proGiven={link.proGiven} />
    </Card>
  );
}
