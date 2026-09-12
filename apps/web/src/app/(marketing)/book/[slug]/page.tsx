import type { Metadata } from 'next';
import { brand } from '@repo/config/brand';
import { EmptyState } from '@repo/ui/empty-state';
import { Skeleton } from '@repo/ui/skeleton';
import { CalendarX } from 'lucide-react';
import { Suspense } from 'react';
import { getAccess } from '@/lib/auth/session';
import { bookingPage } from '@/lib/booking/public';
import { BookWithInstructor } from './book-with-instructor';

export const metadata: Metadata = { title: 'Book a lesson' };

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

  return (
    <BookWithInstructor
      page={page}
      slug={slug}
      chosen={slot ?? null}
      learner={access?.access.isLearner === true ? { id: access.session.userId } : null}
      signedIn={access !== null}
    />
  );
}
