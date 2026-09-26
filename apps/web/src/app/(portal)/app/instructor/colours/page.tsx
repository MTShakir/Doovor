import { hasEntitlement } from '@repo/config/plans';
import { PageHeader } from '@repo/ui/app-shell';
import { SkeletonRow } from '@repo/ui/skeleton';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ProUpsell } from '@/components/pro';
import { requirePortal } from '@/lib/auth/session';
import { brandColour } from '@/lib/branding/colour';
import { ColourPicker } from './colour-picker';

export const metadata: Metadata = { title: 'Your booking colours' };

/** D-210: the colour a learner sees on the booking page, picked by the owner. */
export default function BookingColoursPage() {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader title="Your booking colours" subtitle="Your booking page in your own colour." />
      <div className="flex flex-col gap-4 px-4 md:max-w-2xl md:px-8">
        <Suspense fallback={<SkeletonRow />}>
          <Colours />
        </Suspense>
      </div>
    </main>
  );
}

async function Colours() {
  await requirePortal('instructor');
  const current = await brandColour();
  if (!current) return null;

  if (!hasEntitlement(current.plan, 'customBookingColours')) {
    return (
      <ProUpsell
        feature="Your own colours"
        description="Your booking page and the buttons a learner taps, in the colour of your own business rather than ours."
      />
    );
  }

  return <ColourPicker businessId={current.businessId} colour={current.colour} />;
}
