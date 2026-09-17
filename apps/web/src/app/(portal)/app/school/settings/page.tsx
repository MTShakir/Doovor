import { resolveBookingRules } from '@repo/core/booking-rules';
import { PageHeader } from '@repo/ui/app-shell';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { SkeletonRow } from '@repo/ui/skeleton';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PackagesEditor } from '@/components/catalogue/packages-editor';
import { PricesForm } from '@/components/catalogue/prices-form';
import { BookingRulesForm } from '@/components/settings/booking-rules-form';
import { requirePortal } from '@/lib/auth/session';
import { businessCatalogue } from '@/lib/catalogue/catalogue';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { saveSchoolPackage, saveSchoolPrices, saveSchoolRules } from './actions';

export const metadata: Metadata = { title: 'Settings' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** SCH-04: the prices, packages and booking rules that apply to everybody who teaches here. */
export default function SchoolSettingsPage() {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader title="Settings" subtitle="Prices, packages and booking rules for everybody who teaches here." />
      <div className="flex max-w-2xl flex-col gap-5 px-4 md:px-8">
        <Suspense fallback={<SkeletonRow />}>
          <Settings />
        </Suspense>
      </div>
    </main>
  );
}

async function Settings() {
  const { access } = await requirePortal('school');
  const school = access.memberships.find((one) => one.businessType === 'school' && (one.role === 'owner' || one.role === 'manager'));
  if (!school) return null;

  const supabase = await createSupabaseServerClient();
  const [catalogue, { data: business }, { data: platform }] = await Promise.all([
    businessCatalogue(school.businessId),
    supabase.from('businesses').select('settings').eq('id', school.businessId).single(),
    supabase.from('platform_settings').select('value').eq('key', 'booking_defaults').maybeSingle(),
  ]);
  const rules = resolveBookingRules(isRecord(platform?.value) ? platform.value : null, isRecord(business?.settings) ? business.settings : null, null);

  return (
    <>
      <Card className="flex flex-col gap-4" role="region" aria-labelledby="school-prices-title">
        <div className="flex flex-col gap-1">
          <CardTitle id="school-prices-title">Prices</CardTitle>
          <CardDescription>What learners pay for each lesson, with any of your instructors you have not let set their own.</CardDescription>
        </div>
        <PricesForm rows={catalogue.rows} mode="business" save={saveSchoolPrices} />
      </Card>
      <Card className="flex flex-col gap-4" role="region" aria-labelledby="school-packages-title">
        <div className="flex flex-col gap-1">
          <CardTitle id="school-packages-title">Packages</CardTitle>
          <CardDescription>Hours learners buy ahead, used with any of your instructors.</CardDescription>
        </div>
        <PackagesEditor packages={catalogue.packages} save={saveSchoolPackage} />
      </Card>
      <Card className="flex flex-col gap-4" role="region" aria-labelledby="school-rules-title">
        <div className="flex flex-col gap-1">
          <CardTitle id="school-rules-title">Booking and cancellation rules</CardTitle>
          <CardDescription>
            Notice, how far ahead, the cancellation policy and reminders, for everybody who teaches here. Each instructor keeps their own gap
            between lessons.
          </CardDescription>
        </div>
        <BookingRulesForm rules={rules} saveBusinessRules={saveSchoolRules} />
      </Card>
    </>
  );
}
