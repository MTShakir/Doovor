import { brand } from '@repo/config/brand';
import type { Metadata } from 'next';
import { instructorProfilePath } from '@repo/core/public-profile';
import type { Specialism } from '@repo/core/schemas/profile';
import { canSendBadge, isBadgeExpired } from '@repo/core/badge-expiry';
import { formatCalendarDate, todayInZone } from '@repo/core/time';
import { PageHeader } from '@repo/ui/app-shell';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { SkeletonRow } from '@repo/ui/skeleton';
import { StatusPill } from '@repo/ui/status-pill';
import { Suspense } from 'react';
import { FormAlert } from '@/components/form-alert';
import { BookingLinkCard } from '@/components/share/booking-link-card';
import { vouchingSchool } from '@/lib/school/link';
import { getAppUrl } from '@/lib/app-url';
import { requirePortal } from '@/lib/auth/session';
import { getGeoProvider } from '@/lib/geo/provider';
import { instructorProfile } from '@/lib/public/instructor-profile';
import { getSiteUrl } from '@/lib/site-url';
import { signedBadgeUrl } from '@/lib/storage/images';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ProfileForm } from './profile-form';
import { SendBadge } from './send-badge';
import { SearchListing } from './search-listing';
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

/**
 * INS-02: the badge is shown here, and changed only by a submission a person reviews. One that was
 * never sent, was refused, or has run out can be sent from here (D-262).
 */
function verification(status: string, expired: boolean) {
  if (status === 'approved' && expired) {
    return {
      pill: 'attention' as const,
      label: 'Badge run out',
      copy: 'Your profile is not taking bookings. Send your new badge to get the tick back.',
      action: 'Send your new badge',
    };
  }
  if (status === 'approved') return { pill: 'confirmed' as const, label: 'Verified', copy: 'Learners see the blue tick on your profile.', action: null };
  if (status === 'pending') {
    return { pill: 'pending' as const, label: 'Being checked', copy: 'We are checking your badge against the DVSA register.', action: null };
  }
  if (status === 'rejected') {
    // Something to put right, not something crossed out: "attention" rather than "cancelled".
    return { pill: 'attention' as const, label: 'Not approved', copy: 'We could not verify your badge. Send it again and we will check it.', action: 'Send your badge again' };
  }
  return { pill: 'unpaid' as const, label: 'Not sent yet', copy: 'Send your badge for checking to get the blue tick.', action: 'Send your badge' };
}

/**
 * A school's instructor: vouched for by the school rather than checked by the platform, with the badge's
 * details theirs to keep up to date at any time for the reminders (D-280).
 */
function vouched(school: string, expired: boolean, hasBadge: boolean) {
  if (expired) {
    return {
      pill: 'attention' as const,
      label: 'Badge run out',
      copy: 'Your profile is not taking bookings. Add your new badge and it will take them again.',
      action: 'Add your new badge',
    };
  }
  return {
    pill: 'confirmed' as const,
    label: 'Vouched for',
    copy: `${school} vouches for you, so ${brand.name} does not check your badge.${hasBadge ? ' We remind you before it runs out.' : ' Add its number and expiry date so we can remind you before it runs out.'}`,
    action: hasBadge ? 'Change your badge' : 'Add your badge',
  };
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
      'display_name, bio, photo_path, languages, years_teaching, transmission, car_make, car_model, dual_controls, specialisms, qualification, badge_number, badge_expiry, badge_path, verification_status, verification_decision_reason, supervisor_business_id, supervisor_instructor_id, base_postcode, radius_miles, public_slug, is_listed',
    )
    .eq('id', membership.instructorProfileId)
    .single();
  if (!profile) return null;

  const today = todayInZone();
  const expired = profile.badge_expiry !== null && isBadgeExpired(profile.badge_expiry, today);
  // The school that vouches for them: the one they teach under, or the one they are linked to (D-280).
  const school = await vouchingSchool(membership);
  const badge =
    school === null ? verification(profile.verification_status, expired) : vouched(school, expired, profile.badge_number !== null);
  const sendable = school !== null || canSendBadge(profile.verification_status, profile.badge_expiry, today);
  // The badge bucket is private, so a photo still on file is shown through a short-lived address.
  const badgePreview = sendable && school === null ? await signedBadgeUrl(supabase, profile.badge_path) : undefined;

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

  // PUB-03: the link and the profile exist once the platform has approved the badge (INS-05), and
  // the link takes bookings while the badge is in date (INS-03). The card says which.
  const published =
    profile.verification_status === 'approved' && profile.public_slug ? await instructorProfile(profile.public_slug) : null;
  const bookingUrl = published?.takingBookings ? `${getAppUrl()}/book/${published.slug}` : null;
  const profileUrl = published
    ? `${getSiteUrl()}${instructorProfilePath(published.place?.citySlug ?? null, published.slug)}`
    : null;

  return (
    <>
      <BookingLinkCard
        instructorName={profile.display_name}
        bookingUrl={bookingUrl}
        profileUrl={profileUrl}
        unavailable={published && !published.takingBookings ? 'badge-expired' : 'approval'}
      />
      {published ? <SearchListing listed={profile.is_listed} badgeExpired={!published.takingBookings} /> : null}
      <Card className="flex flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
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
        {profile.verification_status === 'rejected' && profile.verification_decision_reason ? (
          <p className="rounded-input bg-grey-100 p-3 text-small text-ink">
            <span className="font-semibold">Why: </span>
            {profile.verification_decision_reason}
          </p>
        ) : null}
        {profile.qualification === 'pdi' ? <Supervision supervised={supervised} /> : null}
        {sendable && badge.action ? (
          <div className="pt-2">
            <SendBadge
              label={badge.action}
              reason={profile.verification_status === 'rejected' ? profile.verification_decision_reason : null}
              profileId={membership.instructorProfileId}
              qualification={profile.qualification}
              badgeNumber={profile.badge_number}
              badgeExpiry={profile.badge_expiry}
              badgePreview={badgePreview}
              hasBadgePhoto={profile.badge_path !== null}
              vouchedBy={school}
            />
          </div>
        ) : null}
      </Card>
      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <CardTitle>Where you teach</CardTitle>
          <CardDescription>The circle around your base, and any exceptions to it.</CardDescription>
        </div>
        <CoverageForm postcode={profile.base_postcode} radiusMiles={profile.radius_miles} centre={centre} />
        <CoverageEditor districts={districts ?? []} />
      </Card>
      {/*
        Everything a learner reads about them, on a surface of its own (D-226). It sat straight on
        the canvas while the three sections above it were cards, so the page stopped looking like a
        page half way down and the chips and fields had nothing behind them.
      */}
      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <CardTitle>About you</CardTitle>
          <CardDescription>What a learner reads before they book.</CardDescription>
        </div>
        <ProfileForm
          profileId={membership.instructorProfileId}
          photoPath={profile.photo_path}
          values={{
            displayName: profile.display_name,
            // Their own business is theirs to name; a school's is not (D-196).
            ...(membership.businessType === 'independent' && membership.role === 'owner'
              ? { businessName: membership.businessName }
              : {}),
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
      </Card>
    </>
  );
}
