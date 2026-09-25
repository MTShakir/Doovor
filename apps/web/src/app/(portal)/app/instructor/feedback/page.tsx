import { PageHeader } from '@repo/ui/app-shell';
import { SkeletonRow } from '@repo/ui/skeleton';
import { ChevronLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { requireAccess } from '@/lib/auth/session';
import { FeedbackForm } from './feedback-form';

export const metadata: Metadata = { title: 'Tell us something' };

/** D-202: a request, a problem, or anything else, from anybody using the app. */
export default function FeedbackPage() {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <div className="px-4 pt-4 md:px-8">
        <Link
          href="/app/instructor/more"
          className="inline-flex min-h-12 items-center gap-1 text-body font-semibold text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
        >
          <ChevronLeft className="size-5 shrink-0" aria-hidden />
          More
        </Link>
      </div>
      <PageHeader title="Tell us something" subtitle="What is missing, what is wrong, or what you would change." />
      <div className="flex flex-col gap-4 px-4 md:max-w-2xl md:px-8">
        <Suspense fallback={<SkeletonRow />}>
          <Form />
        </Suspense>
      </div>
    </main>
  );
}

async function Form() {
  await connection();
  const { access } = await requireAccess();
  return <FeedbackForm userId={access.userId} />;
}
