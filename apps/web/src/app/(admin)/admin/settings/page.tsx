import { PageHeader } from '@repo/ui/app-shell';
import { Skeleton } from '@repo/ui/skeleton';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { FeatureFlagsForm, MarketplaceFeeForm, PlanLimitsForm, SettingCard, SwitchOnRuleForm } from '@/components/admin/settings';
import { BookingRulesForm } from '@/components/settings/booking-rules-form';
import { adminSettings } from '@/lib/admin/settings';
import { requirePortal } from '@/lib/auth/session';
import { saveBookingDefaults, saveFeatureFlags, saveMarketplaceFee, savePlanLimits, saveSwitchOnRule } from './actions';

export const metadata: Metadata = { title: 'Settings' };

/** ADM-05: what every Business starts with, and what is switched on for everybody. */
export default function AdminSettingsPage() {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader title="Settings" subtitle="What every Business starts with, and what is switched on for everybody." />
      <div className="flex flex-col gap-4 px-4 md:px-8 lg:max-w-4xl">
        <Suspense fallback={<SettingsSkeleton />}>
          <Settings />
        </Suspense>
      </div>
    </main>
  );
}

async function Settings() {
  const { access } = await requirePortal('admin');
  const settings = await adminSettings();
  // Platform settings are the founders' to change (PRD 6.2); support staff see them.
  const readOnly = access.staffRole !== 'super_admin';

  return (
    <>
      {readOnly ? <p className="text-small text-grey-700">Only a super admin can change these.</p> : null}
      <SettingCard
        title="Default booking rules"
        description="What every Business starts with until it sets its own (PRD 11.1)."
        changedOn={settings.changedOn.bookingDefaults}
      >
        <BookingRulesForm rules={settings.bookingDefaults} savePlatformRules={saveBookingDefaults} readOnly={readOnly} />
      </SettingCard>
      <SettingCard
        title="Switch-on rule"
        description="What a postcode area needs before the learner marketplace can open there (PRD 4.2)."
        changedOn={settings.changedOn.switchOnRule}
      >
        <SwitchOnRuleForm rule={settings.switchOnRule} save={saveSwitchOnRule} readOnly={readOnly} />
      </SettingCard>
      <SettingCard
        title="Plan limits"
        description="Text message reminders a Business on each paid plan may send in a calendar month (NTF-01)."
        changedOn={settings.changedOn.planLimits}
      >
        <PlanLimitsForm limits={settings.planLimits} save={savePlanLimits} readOnly={readOnly} />
      </SettingCard>
      <SettingCard
        title="Marketplace fee"
        description="Charged from Phase 3 on a learner's first booking with an instructor through the marketplace. Nothing is charged now."
        changedOn={settings.changedOn.marketplaceFee}
      >
        <MarketplaceFeeForm fee={settings.marketplaceFee} save={saveMarketplaceFee} readOnly={readOnly} />
      </SettingCard>
      <SettingCard title="Features" description="Switched on or off for everybody, at once." changedOn={settings.changedOn.flags}>
        <FeatureFlagsForm flags={settings.flags} save={saveFeatureFlags} readOnly={readOnly} />
      </SettingCard>
    </>
  );
}

function SettingsSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      {Array.from({ length: 3 }, (_, index) => (
        <Skeleton key={index} className="h-56 rounded-card" />
      ))}
    </div>
  );
}
