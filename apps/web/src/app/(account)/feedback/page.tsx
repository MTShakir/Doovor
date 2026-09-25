import { SkeletonRow } from '@repo/ui/skeleton';
import { ChevronLeft } from 'lucide-react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { landingPath } from '@/lib/auth/portals';
import { requireAccess } from '@/lib/auth/session';
import { FeedbackForm } from './feedback-form';

export const metadata: Metadata = { title: 'Tell us something', robots: { index: false } };

/**
 * D-202: a request, a problem, or anything else, from anybody signed in.
 *
 * It sits beside the account rather than in a portal, because a learner with a problem is worth
 * hearing from as much as an instructor is, and a school owner should not have to be an instructor
 * to say something.
 */
export default function FeedbackPage() {
  return (
    <Suspense fallback={<SkeletonRow />}>
      <Form />
    </Suspense>
  );
}

async function Form() {
  await connection();
  const { access } = await requireAccess();
  return (
    <div className="flex flex-col gap-6">
      <Link
        href={landingPath(access) as Route}
        className="-ml-3 flex h-12 w-fit items-center gap-1 rounded-full px-3 text-body font-medium text-ink hover:bg-grey-100"
      >
        <ChevronLeft size={20} strokeWidth={1.5} aria-hidden />
        Back
      </Link>

      <div className="flex flex-col gap-1">
        <h1 className="text-h1 text-black">Tell us something</h1>
        <p className="text-body text-grey-700">What is missing, what is wrong, or what you would change.</p>
      </div>

      <FeedbackForm userId={access.userId} />
    </div>
  );
}
