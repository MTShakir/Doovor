import type { Metadata } from 'next';
import { brand } from '@repo/config/brand';
import { cancellationPolicyWords } from '@repo/core/cancellation';
import { instructorProfilePath, profileNames } from '@repo/core/public-profile';
import { todayInZone } from '@repo/core/time';
import { Button } from '@repo/ui/button';
import { EmptyState } from '@repo/ui/empty-state';
import { Skeleton } from '@repo/ui/skeleton';
import { CalendarX } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { permanentRedirect } from 'next/navigation';
import { Suspense } from 'react';
import { getAccess, needsToAgree } from '@/lib/auth/session';
import { bookingPage, cancellationPolicy } from '@/lib/booking/public';
import { currentProfileSlug, instructorProfile, nextOpenTimes } from '@/lib/public/instructor-profile';
import { sharedLinkMetadata } from '@/lib/public/metadata';
import { instructorCard } from '@/lib/public/share-cards';
import { getAppUrl } from '@/lib/app-url';
import { redirectTo } from '@/lib/redirect-to';
import { getSiteUrl } from '@/lib/site-url';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { BookWithInstructor } from './book-with-instructor';

/** Named for the instructor, and kept out of search: the profile is the page to find (D-109). */
export async function generateMetadata({ params }: BookPageProps): Promise<Metadata> {
  const { slug } = await params;
  const [page, published] = await Promise.all([bookingPage(slug), instructorProfile(slug)]);
  // By the name the profile goes by: a Business name for somebody running their own (D-269).
  const name = page && published ? profileNames(published.name, published.business).main : page?.name;
  const title = name === undefined ? 'Book a lesson' : `Book a lesson with ${name}`;
  return {
    title,
    robots: { index: false, follow: true },
    // A shared booking link previews with the instructor's own share image (PRD 14.6, M5-08).
    ...(page && published
      ? sharedLinkMetadata({
          title,
          description: `Choose a time and book a driving lesson with ${name ?? page.name}.`,
          url: `${getAppUrl()}/book/${slug}`,
          image: { path: instructorProfilePath(published.place?.citySlug ?? null, published.slug), card: instructorCard(published) },
        })
      : {}),
  };
}

interface BookPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ slot?: string }>;
}

export default function BookPage({ params, searchParams }: BookPageProps) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-8 md:px-6">
      <p className="text-small font-semibold text-grey-700">{brand.name}</p>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Instructor params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

/** BOK-02: the link an instructor shares. Everything here is what they publish. */
async function Instructor({ params, searchParams }: BookPageProps) {
  const { slug } = await params;
  const page = await bookingPage(slug);

  if (!page) {
    // A link given out before the Business was renamed books with the same instructor (D-269),
    // at the time it was opened for.
    const now = await currentProfileSlug(slug);
    if (now !== null) {
      const { slot } = await searchParams;
      permanentRedirect(`/book/${now}${slot === undefined ? '' : `?slot=${encodeURIComponent(slot)}`}` as Route);
    }
    // An instructor opening their own link, often the first thing they do, is told what it waits
    // for rather than to ask themselves for a new one (D-366).
    if (await isOwnLink(slug)) {
      return (
        <EmptyState
          headingLevel={1}
          icon={CalendarX}
          title="Your link is not taking bookings yet"
          description="Today says what is left to do first, such as your badge being checked."
          action={
            <Button asChild width="full">
              <Link href="/app/instructor">Open Today</Link>
            </Button>
          }
        />
      );
    }
    return (
      <EmptyState
        headingLevel={1}
        icon={CalendarX}
        title="This link is not taking bookings"
        description="The instructor may have paused it, or the link may be old. Ask them for a new one."
      />
    );
  }

  const { slot } = await searchParams;
  const access = await getAccess();
  // A learner books under the terms like anything else of theirs: somebody who has not agreed to
  // the current ones, as after claiming an account made for them, agrees first and comes straight
  // back to the time they chose (D-265, D-331).
  if (access?.access.isLearner === true && (await needsToAgree(access))) {
    const here = `/book/${slug}${slot === undefined ? '' : `?slot=${encodeURIComponent(slot)}`}`;
    redirectTo(`/agree?next=${encodeURIComponent(here)}`);
  }
  // The full profile, for somebody who wants to know more before booking (PUB-03), and what
  // cancelling costs, which they are told before they book (BOK-09, R-06).
  const [published, policy] = await Promise.all([instructorProfile(slug), cancellationPolicy(page.instructorId)]);
  const profileUrl = published
    ? `${getSiteUrl()}${instructorProfilePath(published.place?.citySlug ?? null, published.slug)}`
    : null;
  // The link opens on the first day with a free time, not on a day that has none (PUB-03).
  const shortest = page.lessons.length === 0 ? null : Math.min(...page.lessons.map((lesson) => lesson.durationMinutes));
  const soonest = shortest === null ? undefined : (await nextOpenTimes(page.instructorId, shortest))[0];

  return (
    <BookWithInstructor
      page={page}
      names={published ? profileNames(published.name, published.business) : { main: page.name, personal: null }}
      slug={slug}
      profileUrl={profileUrl}
      findUrl={`${getSiteUrl()}/learners#find-an-instructor`}
      firstFreeDay={soonest === undefined ? null : todayInZone(new Date(soonest))}
      chosen={slot ?? null}
      cancellation={policy === null ? null : cancellationPolicyWords(policy)}
      learner={access?.access.isLearner === true ? { id: access.session.userId } : null}
      signedIn={access !== null}
    />
  );
}

/** Whether the person looking is the instructor whose link this is (D-366). */
async function isOwnLink(slug: string): Promise<boolean> {
  const access = await getAccess();
  if (!access) return false;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('instructor_profiles')
    .select('id')
    .eq('user_id', access.session.userId)
    .eq('public_slug', slug)
    .maybeSingle();
  return data !== null;
}
