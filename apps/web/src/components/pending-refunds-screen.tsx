import { formatPence } from '@repo/core/money';
import { formatDate, formatDateTime } from '@repo/core/time';
import { PageHeader } from '@repo/ui/app-shell';
import { Card } from '@repo/ui/card';
import { EmptyState } from '@repo/ui/empty-state';
import { SkeletonRow } from '@repo/ui/skeleton';
import { ChevronLeft, HandCoins } from 'lucide-react';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { HandBack } from '@/app/(portal)/app/instructor/learners/[id]/hand-back';
import { paymentsState } from '@/lib/payments/connect';
import { pendingRefunds } from '@/lib/payments/transactions';

/**
 * Cash and bank transfers owed back and not yet handed over (R-08, PAY-07, D-195).
 *
 * A card refund goes back on its own; money taken in person has to be handed over by somebody, and
 * until they say they have, nothing in the app knows it happened. This is the list of those.
 */
export function PendingRefundsScreen({ screen }: { screen: 'instructor' | 'school' }) {
  const base = screen === 'school' ? '/app/school/money' : '/app/instructor/money';
  return (
    <main className="flex flex-col gap-4 pb-8">
      <div className="px-4 pt-4 md:px-8">
        <Link
          href={base}
          className="inline-flex min-h-12 items-center gap-1 text-body font-semibold text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
        >
          <ChevronLeft className="size-5 shrink-0" aria-hidden />
          Money
        </Link>
      </div>
      <PageHeader title="Pending refunds" subtitle="Money owed back in person, and not yet handed over." />
      <div className="flex flex-col gap-4 px-4 md:max-w-2xl md:px-8">
        <Suspense fallback={<SkeletonRow />}>
          <Owed />
        </Suspense>
      </div>
    </main>
  );
}

async function Owed() {
  await connection();
  const state = await paymentsState();
  if (!state) return null;
  const owed = await pendingRefunds(state.businessId);

  if (owed.length === 0) {
    return (
      <Card padding="none">
        <EmptyState
          icon={HandCoins}
          title="Nothing owed back"
          description="Refunds paid in cash or by bank transfer wait here until you mark them handed back."
        />
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-3" role="region" aria-labelledby="owed-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="owed-title" className="text-h3 text-black">
          {owed.length === 1 ? '1 refund' : `${String(owed.length)} refunds`}
        </h2>
        <span className="text-body text-ink tabular-nums">
          {formatPence(owed.reduce((total, one) => total + one.amountPence, 0))}
        </span>
      </div>
      <ul className="flex flex-col divide-y divide-grey-200" aria-label="Refunds owed back">
        {owed.map((one) => (
          <li key={one.refundId} className="flex flex-col gap-2 py-3">
            <div className="flex items-start gap-3">
              <span className="flex min-w-0 flex-1 flex-col">
                <Link
                  href={`/app/instructor/learners/${one.learnerId}`}
                  className="text-body font-semibold text-black underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
                >
                  {one.learnerName}
                </Link>
                <span className="text-small text-grey-700">
                  Owed since {formatDate(one.at)} · {one.reason}
                </span>
                {one.lessonAt ? (
                  <span className="text-small text-grey-700">Lesson on {formatDateTime(one.lessonAt)}</span>
                ) : null}
              </span>
              <span className="shrink-0 text-body text-ink tabular-nums">{formatPence(one.amountPence)}</span>
            </div>
            <div className="flex justify-end">
              <HandBack
                refundId={one.refundId}
                learnerId={one.learnerId}
                learnerName={one.learnerName}
                amountPence={one.amountPence}
              />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
