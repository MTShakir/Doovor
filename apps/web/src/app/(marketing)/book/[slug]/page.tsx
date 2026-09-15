import type { Metadata } from 'next';
import { brand } from '@repo/config/brand';
import { instructorProfilePath } from '@repo/core/public-profile';
import { todayInZone } from '@repo/core/time';
import { EmptyState } from '@repo/ui/empty-state';
import { Skeleton } from '@repo/ui/skeleton';
import { CalendarX } from 'lucide-react';
import { Suspense } from 'react';
import { getAccess } from '@/lib/auth/session';
import { bookingPage } from '@/lib/booking/public';
import { instructorProfile, nextOpenTimes } from '@/lib/public/instructor-profile';
import { getSiteUrl } from '@/lib/site-url';
import { BookWithInstructor } from './book-with-instructor';

/** Named for the instructor, and kept out of search: the profile is the page to find (D-109). */
export async function generateMetadata({ params }: BookPageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = await bookingPage(slug);
  return { title: page ? `Book a lesson with ${page.name}` : 'Book a lesson', robots: { index: false, follow: true } };
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
    return (
      <EmptyState
        icon={CalendarX}
        title="This link is not taking bookings"
        description="The instructor may have paused it, or the link may be old. Ask them for a new one."
      />
    );
  }

  const { slot } = await searchParams;
  const access = await getAccess();
  // The full profile, for somebody who wants to know more before booking (PUB-03).
  const published = await instructorProfile(slug);
  const profileUrl = published
    ? `${getSiteUrl()}${instructorProfilePath(published.place?.citySlug ?? null, published.slug)}`
    : null;
  // The link opens on the first day with a free time, not on a day that has none (PUB-03).
  const shortest = page.lessons.length === 0 ? null : Math.min(...page.lessons.map((lesson) => lesson.durationMinutes));
  const soonest = shortest === null ? undefined : (await nextOpenTimes(page.instructorId, shortest))[0];

  return (
    <BookWithInstructor
      page={page}
      slug={slug}
      profileUrl={profileUrl}
      firstFreeDay={soonest === undefined ? null : todayInZone(new Date(soonest))}
      chosen={slot ?? null}
      learner={access?.access.isLearner === true ? { id: access.session.userId } : null}
      signedIn={access !== null}
    />
  );
}
