import { Button } from '@repo/ui/button';
import { Skeleton } from '@repo/ui/skeleton';
import { MailCheck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

export const metadata: Metadata = { title: 'Check your email' };

const messages = {
  signup: 'We sent you a link to confirm your email address. Open it to finish creating your account.',
  link: 'If there is an account for that email, we sent it a sign-in link. It works once and expires in 1 hour.',
  reset: 'If there is an account for that email, we sent it a link to choose a new password.',
} as const;

export default function CheckEmailPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  return (
    <div className="flex flex-col gap-6">
      <span className="flex size-16 items-center justify-center rounded-full bg-grey-100 text-black">
        <MailCheck size={32} strokeWidth={1.5} aria-hidden />
      </span>
      <h1 className="text-h1 text-black">Check your email</h1>
      <Suspense fallback={<Skeleton className="h-12 w-full" />}>
        <Message searchParams={searchParams} />
      </Suspense>
      {process.env.APP_ENV === 'local' ? (
        <p className="text-small text-grey-700">Local development: emails arrive in the local mailbox on port 54324.</p>
      ) : null}
      <Button asChild variant="secondary" width="full" size="lg">
        <Link href="/sign-in">Back to sign in</Link>
      </Button>
    </div>
  );
}

async function Message({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams;
  const key = kind === 'link' || kind === 'reset' ? kind : 'signup';
  return <p className="text-body text-ink">{messages[key]}</p>;
}
