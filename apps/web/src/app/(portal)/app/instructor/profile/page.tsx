import type { Metadata } from 'next';
import type { Specialism } from '@repo/core/schemas/profile';
import { formatCalendarDate } from '@repo/core/time';
import { PageHeader } from '@repo/ui/app-shell';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { SkeletonRow } from '@repo/ui/skeleton';
import { StatusPill } from '@repo/ui/status-pill';
import { Suspense } from 'react';
import { requirePortal } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ProfileForm } from './profile-form';

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

async function Profile() {
  const { access } = await requirePortal('instructor');
  const membership = access.memberships.find((m) => m.instructorProfileId !== null);
  if (!membership?.instructorProfileId) return null;

  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase
    .from('instructor_profiles')
    .select(
      'display_name, bio, photo_path, languages, years_teaching, transmission, car_make, car_model, dual_controls, specialisms, qualification, badge_number, badge_expiry, verification_status',
    )
    .eq('id', membership.instructorProfileId)
    .single();
  if (!profile) return null;

  const badge = verification(profile.verification_status);

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
