import type { Metadata } from 'next';
import type { Specialism } from '@repo/core/schemas/profile';
import { formatCalendarDate } from '@repo/core/time';
import { PageHeader } from '@repo/ui/app-shell';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { SkeletonRow } from '@repo/ui/skeleton';
import { StatusPill } from '@repo/ui/status-pill';
import { Suspense } from 'react';
import { FormAlert } from '@/components/form-alert';
import { requirePortal } from '@/lib/auth/session';
import { getGeoProvider } from '@/lib/geo/provider';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ProfileForm } from './profile-form';
import { CoverageEditor } from '../coverage-editor';
import { CoverageForm } from '../coverage-form';

export const metadata: Metadata = { title: 'Your profile' };

export default function InstructorProfilePage() {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader title="Profile" subtitle="What learners see before they book." />
      <div className="flex max-w-2xl flex-col gap-5 px-4 md:px-8">
        <Suspense fallback={<SkeletonRow />}>
          <Profile />
        </Suspense>
      </div>
    </main>
  );
}

/** INS-02: the badge is shown here but changed only by a submission a person reviews. */
function verification(status: string) {
  if (status === 'approved') return { pill: 'confirmed' as const, label: 'Verified', copy: 'Learners see the blue tick on your profile.' };
  if (status === 'pending') return { pill: 'pending' as const, label: 'Being checked', copy: 'We are checking your badge against the DVSA register.' };
  if (status === 'rejected') return { pill: 'cancelled' as const, label: 'Not approved', copy: 'Get in touch and we will tell you what we need.' };
  return { pill: 'unpaid' as const, label: 'Not sent yet', copy: 'Send your badge for checking to get the blue tick.' };
}

/** R-18: a trainee teaches only under a school or an approved instructor (INS-04). */
function Supervision({ supervised }: { supervised: boolean }) {
  return supervised ? (
    <CardDescription>A school is supervising you, so you can take bookings.</CardDescription>
  ) : (
    <FormAlert>
      You need a supervising school or approved instructor before you can take bookings. Ask the school you teach for
      to add you, or get in touch and we will help.
    </FormAlert>
  );
}

async function Profile() {
  const { access } = await requirePortal('instructor');
  const membership = access.memberships.find((m) => m.instructorProfileId !== null);
  if (!membership?.instructorProfileId) return null;

  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase
    .from('instructor_profiles')
    .select(
      'display_name, bio, photo_path, languages, years_teaching, transmission, car_make, car_model, dual_controls, specialisms, qualification, badge_number, badge_expiry, verification_status, supervisor_business_id, supervisor_instructor_id, base_postcode, radius_miles',
    )
    .eq('id', membership.instructorProfileId)
    .single();
  if (!profile) return null;

  const badge = verification(profile.verification_status);

  // A base postcode saved earlier is in the cache, so the circle is drawn on the first paint.
  const geo = await getGeoProvider();
  const found = profile.base_postcode ? await geo.lookup(profile.base_postcode) : null;
  const centre = found?.ok ? { latitude: found.place.latitude, longitude: found.place.longitude } : null;
  const { data: districts } = await supabase
    .from('coverage_districts')
    .select('outcode, rule')
    .eq('instructor_id', membership.instructorProfileId)
    .order('outcode');
  const supervised = profile.supervisor_business_id !== null || profile.supervisor_instructor_id !== null;

  return (
    <>
      <Card className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <CardTitle>{profile.qualification === 'pdi' ? 'Trainee instructor' : 'Approved driving instructor'}</CardTitle>
          <StatusPill status={badge.pill}>{badge.label}</StatusPill>
        </div>
        <CardDescription>{badge.copy}</CardDescription>
        {profile.badge_number ? (
          <CardDescription>
            Badge {profile.badge_number}
            {profile.badge_expiry ? `, expires ${formatCalendarDate(profile.badge_expiry)}` : ''}
          </CardDescription>
        ) : null}
        {profile.qualification === 'pdi' ? <Supervision supervised={supervised} /> : null}
      </Card>
      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <CardTitle>Where you teach</CardTitle>
          <CardDescription>The circle around your base, and any exceptions to it.</CardDescription>
        </div>
        <CoverageForm postcode={profile.base_postcode} radiusMiles={profile.radius_miles} centre={centre} />
        <CoverageEditor districts={districts ?? []} />
      </Card>
      <ProfileForm
        profileId={membership.instructorProfileId}
        photoPath={profile.photo_path}
        values={{
          displayName: profile.display_name,
          bio: profile.bio ?? '',
          languages: profile.languages,
          yearsTeaching: profile.years_teaching === null ? '' : String(profile.years_teaching),
          transmission: profile.transmission,
          carMake: profile.car_make ?? '',
          carModel: profile.car_model ?? '',
          dualControls: profile.dual_controls,
          specialisms: profile.specialisms as Specialism[],
        }}
      />
    </>
  );
}
