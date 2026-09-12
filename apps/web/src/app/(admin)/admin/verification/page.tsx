import type { Metadata } from 'next';
import { formatCalendarDate, formatDateTime } from '@repo/core/time';
import { PageHeader } from '@repo/ui/app-shell';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { EmptyState } from '@repo/ui/empty-state';
import { SkeletonRow } from '@repo/ui/skeleton';
import { BadgeCheck } from 'lucide-react';
import { Suspense } from 'react';
import { requirePortal } from '@/lib/auth/session';
import { signedBadgeUrl } from '@/lib/storage/images';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { DecisionForm } from './decision-form';

export const metadata: Metadata = { title: 'Verification' };

export default function VerificationQueuePage() {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader title="Verification" subtitle="Badges waiting to be checked against the DVSA register." />
      <div className="flex flex-col gap-4 px-4 md:px-8">
        <Suspense fallback={<SkeletonRow />}>
          <Queue />
        </Suspense>
      </div>
    </main>
  );
}

async function Queue() {
  await requirePortal('admin');
  const supabase = await createSupabaseServerClient();
  const { data: waiting } = await supabase
    .from('instructor_profiles')
    .select(
      'id, display_name, qualification, badge_number, badge_expiry, badge_path, verification_submitted_at, businesses!instructor_profiles_business_id_fkey(name)',
    )
    .eq('verification_status', 'pending')
    .order('verification_submitted_at', { ascending: true })
    .limit(50);

  if (!waiting?.length) {
    return (
      <EmptyState
        icon={BadgeCheck}
        title="Nothing waiting"
        description="Every badge that has been sent in has been checked."
      />
    );
  }

  // Badge photos are private, so each one is shown through a short-lived address (INS-02).
  const photos = await Promise.all(waiting.map((row) => signedBadgeUrl(supabase, row.badge_path, 600)));

  return (
    <ul className="flex flex-col gap-4">
      {waiting.map((row, index) => (
        <li key={row.id}>
          <Card className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex min-w-0 flex-col gap-1">
              <CardTitle>{row.display_name}</CardTitle>
              <CardDescription>
                {/* An independent instructor's business is named after them, so saying both twice
                    tells nobody anything. */}
                {row.businesses.name === row.display_name ? '' : `${row.businesses.name} · `}
                {row.qualification === 'pdi' ? 'Trainee instructor (PDI)' : 'Approved driving instructor (ADI)'}
              </CardDescription>
              <CardDescription>
                Badge {row.badge_number ?? 'not given'}
                {row.badge_expiry ? `, expires ${formatCalendarDate(row.badge_expiry)}` : ''}
              </CardDescription>
              {row.verification_submitted_at ? (
                <CardDescription>Sent {formatDateTime(new Date(row.verification_submitted_at))}</CardDescription>
              ) : null}
              <div className="mt-2">
                <DecisionForm profileId={row.id} name={row.display_name} />
              </div>
            </div>
            {photos[index] ? (
              <a
                href={photos[index]}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
              >
                {/* A signed address that expires, for a private document: the image
                    optimiser would cache a copy of it and keep it past that. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photos[index]}
                  alt={`The badge ${row.display_name} sent in`}
                  className="max-h-40 w-full rounded-card border border-grey-200 object-contain md:w-64"
                />
              </a>
            ) : (
              <p className="shrink-0 text-small text-grey-700 md:w-64">No badge photo was sent.</p>
            )}
          </Card>
        </li>
      ))}
    </ul>
  );
}
