import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { Button } from '@repo/ui/button';
import { Users } from 'lucide-react';
import Link from 'next/link';
import type { LearnerAllowance } from '@/lib/learners/allowance';
import { ProTag } from './pro';

/**
 * How many learners a Free plan is carrying, and how many it may (D-208).
 *
 * Only shown where there is a number to show, which is Free. It is here rather than only in the
 * refusal because finding out you are full at the moment you are adding somebody is finding out
 * too late: an instructor needs to see it coming while there is still time to move somebody to
 * passed or to think about Pro.
 */
export function LearnerAllowanceNote({ allowance }: { allowance: LearnerAllowance }) {
  if (allowance.limit === null) return null;
  const left = allowance.limit - allowance.onBooks;
  const full = left <= 0;

  return (
    <Card className={full ? 'flex flex-col gap-3 bg-yellow-100' : 'flex flex-col gap-3'} role="region" aria-labelledby="allowance-title">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <Users className="mt-0.5 size-5 shrink-0 text-ink" aria-hidden />
          <div className="flex flex-col gap-1">
            <CardTitle id="allowance-title">
              {String(allowance.onBooks)} of {String(allowance.limit)} learners
            </CardTitle>
            <CardDescription className={full ? 'text-ink' : undefined}>
              {full
                ? 'Free carries ten at a time. To take somebody new on, move one to passed or left, or go Pro for as many as you like.'
                : `Free carries ${String(allowance.limit)} at a time. Counting the ones you are teaching, waiting or with a test booked.`}
            </CardDescription>
          </div>
        </div>
        {full ? <ProTag /> : null}
      </div>
      {full ? (
        <Button asChild width="full">
          <Link href="/app/instructor/plan">See what Pro includes</Link>
        </Button>
      ) : null}
    </Card>
  );
}
