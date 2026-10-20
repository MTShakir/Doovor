import { officeEnquiryConsentWords } from '@repo/core/schemas/school';
import { PageHeader } from '@repo/ui/app-shell';
import { SkeletonRow } from '@repo/ui/skeleton';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { requirePortal } from '@/lib/auth/session';
import { enquiryCounts, enquiryStatuses, schoolEnquiries, type EnquiryStatus } from '@/lib/school/enquiries';
import { schoolTeam } from '@/lib/school/team';
import { PupilsScreen } from './pupils-screen';

export const metadata: Metadata = { title: 'New pupils' };

interface PupilsProps {
  searchParams: Promise<{ status?: string | string[] }>;
}

function statusFrom(value: string | string[] | undefined): EnquiryStatus {
  return enquiryStatuses.find((one) => one === value) ?? 'new';
}

/** SCH-03, GAP-01, D-288: the people who asked the school for lessons. */
export default function SchoolPupilsPage({ searchParams }: PupilsProps) {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader title="New pupils" subtitle="People who asked for lessons." />
      <div className="flex flex-col gap-4 px-4 md:max-w-3xl md:px-8">
        <Suspense fallback={<SkeletonRow />}>
          <Pupils searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function Pupils({ searchParams }: PupilsProps) {
  const status = statusFrom((await searchParams).status);
  const { access } = await requirePortal('school');
  const school = access.memberships.find((one) => one.businessType === 'school' && (one.role === 'owner' || one.role === 'manager'));
  if (!school) return null;

  // Names for who a pupil is offered to or taken by, and who there is to offer or give them to.
  const team = await schoolTeam(school.businessId);
  const teachers = team.members.filter((one) => one.active && one.instructorId !== null);
  const names = {
    businesses: new Map(team.linked.map((one) => [one.businessId, one.businessName])),
    instructors: new Map(teachers.flatMap((one) => (one.instructorId === null ? [] : [[one.instructorId, one.name] as const]))),
  };
  const [enquiries, counts] = await Promise.all([schoolEnquiries(school.businessId, status, names), enquiryCounts(school.businessId)]);
  return (
    <PupilsScreen
      status={status}
      counts={counts}
      enquiries={enquiries}
      consentWords={officeEnquiryConsentWords(school.businessName)}
      linked={team.linked.map((one) => ({ linkId: one.linkId, name: one.name, businessName: one.businessName }))}
      hasTeachers={teachers.length > 0 || school.instructorProfileId !== null}
    />
  );
}
