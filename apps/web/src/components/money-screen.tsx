import { formatPence } from '@repo/core/money';
import { moneyPeriodKeys, type MoneyPeriodKey } from '@repo/core/money-periods';
import { formatDate, formatMinutes } from '@repo/core/time';
import { PageHeader } from '@repo/ui/app-shell';
import { Button } from '@repo/ui/button';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { EmptyState } from '@repo/ui/empty-state';
import { SkeletonRow } from '@repo/ui/skeleton';
import { BadgePoundSterling, ChevronRight, HandCoins } from 'lucide-react';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { paymentsState } from '@/lib/payments/connect';
import { moneySummary } from '@/lib/payments/money-summary';
import { moneyTransactions, pendingRefunds, type Transaction } from '@/lib/payments/transactions';

/** The two Money screens, spelled out so a link built from one is still a route the app has. */
type MoneyBase = '/app/instructor/money' | '/app/school/money';

/** How many transactions a first look shows, and how many more each time (D-195). */
const PAGE = 5;
/** As many as the database will hand over in one go. */
const MOST = 50;

export function MoneyScreen({
  screen,
  searchParams,
}: {
  screen: 'instructor' | 'school';
  searchParams: Promise<{ period?: string | string[]; show?: string | string[] }>;
}) {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader title="Money" subtitle="What you have taken, and what is owed." />
      <div className="flex flex-col gap-4 px-4 md:max-w-2xl md:px-8">
        <Suspense fallback={<SkeletonRow />}>
          <Money screen={screen} searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

const periodTabs: Record<MoneyPeriodKey, string> = { week: 'This week', month: 'This month', tax_year: 'Tax year' };

function periodFrom(value: string | string[] | undefined): MoneyPeriodKey {
  return typeof value === 'string' && (moneyPeriodKeys as readonly string[]).includes(value) ? (value as MoneyPeriodKey) : 'week';
}

/** How many transactions to show, a page at a time and never more than the database will give. */
function showFrom(value: string | string[] | undefined): number {
  const asked = typeof value === 'string' ? Number(value) : PAGE;
  if (!Number.isInteger(asked) || asked < PAGE) return PAGE;
  return Math.min(asked, MOST);
}

/**
 * One figure on the dashboard, with what makes it up underneath.
 *
 * UX: `needsAttention` puts the palest yellow behind one of them, and only where there is really
 * something to do about it. Four identical grey tiles give a number somebody must chase the same
 * weight as two that are zero, so the one thing worth acting on is the hardest to spot. Yellow is
 * the brand's attention colour and is kept for exactly this; the text stays black on it (D-009).
 */
function Figure({
  label,
  amount,
  detail,
  needsAttention = false,
}: {
  label: string;
  amount: string;
  detail: string;
  needsAttention?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-0.5 rounded-card px-4 py-3 ${needsAttention ? 'bg-yellow-100' : 'bg-grey-100'}`}>
      <dt className={needsAttention ? 'text-small text-ink' : 'text-small text-grey-700'}>{label}</dt>
      <dd className="flex flex-col">
        <span className="text-h2 text-black tabular-nums">{amount}</span>
        <span className={needsAttention ? 'text-small text-ink' : 'text-small text-grey-700'}>{detail}</span>
      </dd>
    </div>
  );
}

function lessons(count: number): string {
  return count === 1 ? '1 lesson' : `${String(count)} lessons`;
}

/** MNY-01, M3-21: what the Business took, is owed, sold as credit and gave back, over a period. */
async function MoneyDashboard({ businessId, screen, period }: { businessId: string; screen: 'instructor' | 'school'; period: MoneyPeriodKey }) {
  const summary = await moneySummary(businessId, period);
  if (!summary) return null;
  const base = screen === 'school' ? '/app/school/money' : '/app/instructor/money';

  return (
    <Card className="flex flex-col gap-4" role="region" aria-labelledby="money-in-title">
      <div className="flex flex-col gap-1">
        <CardTitle id="money-in-title">Money in</CardTitle>
        <CardDescription>
          {summary.wholeBusiness ? summary.period.range : `Your own lessons. ${summary.period.range}`}
        </CardDescription>
      </div>
      {/* Three across at any width: a period is a choice of one, and a row that wraps reads as two. */}
      <nav aria-label="Period" className="grid grid-cols-3 gap-2">
        {moneyPeriodKeys.map((key) => (
          <Link
            key={key}
            href={key === 'week' ? base : `${base}?period=${key}`}
            aria-current={key === period ? 'page' : undefined}
            className={`flex h-12 items-center justify-center rounded-full px-2 text-center text-small font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black md:text-body ${
              key === period ? 'bg-black text-white' : 'bg-grey-100 text-black hover:bg-grey-200'
            }`}
          >
            {periodTabs[key]}
          </Link>
        ))}
      </nav>
      <dl className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2" aria-label={summary.period.label}>
        {summary.paid ? (
          <Figure
            label="Paid"
            amount={formatPence(summary.paid.totalPence)}
            detail={`Card ${formatPence(summary.paid.cardPence)}, cash ${formatPence(summary.paid.cashPence)}, bank ${formatPence(summary.paid.bankPence)}`}
          />
        ) : null}
        {/* Money owed is the one figure here somebody has to act on, and only when there is some. */}
        <Figure
          label="Unpaid"
          amount={formatPence(summary.unpaid.totalPence)}
          detail={`${lessons(summary.unpaid.count)} not paid for`}
          needsAttention={summary.unpaid.totalPence > 0}
        />
        {summary.creditSold ? (
          <Figure
            label="Credit sold"
            amount={formatPence(summary.creditSold.totalPence)}
            detail={summary.creditSold.minutes === 0 ? 'No packages' : `${formatMinutes(summary.creditSold.minutes)} of lessons`}
          />
        ) : null}
        {summary.refunds ? (
          <Figure
            label="Refunds"
            amount={formatPence(summary.refunds.totalPence)}
            detail={summary.refunds.count === 1 ? '1 refund' : `${String(summary.refunds.count)} refunds`}
          />
        ) : null}
      </dl>
      {summary.paid ? null : (
        <p className="text-small text-grey-700">The owner decides whether you see what the school takes.</p>
      )}
    </Card>
  );
}

/** MNY-01, PAY-01: the figures, what is still owed back, and the money itself underneath. */
async function Money({
  screen,
  searchParams,
}: {
  screen: 'instructor' | 'school';
  searchParams: Promise<{ period?: string | string[]; show?: string | string[] }>;
}) {
  // The provider is asked as the page renders, which a prerendered shell cannot do.
  await connection();
  const asked = await searchParams;
  const period = periodFrom(asked.period);
  const show = showFrom(asked.show);
  const state = await paymentsState();
  if (!state) {
    return (
      <Card padding="none">
        <EmptyState
          icon={BadgePoundSterling}
          title="No business yet"
          description="Finish setting up your business and payments will appear here."
        />
      </Card>
    );
  }

  const base: MoneyBase = screen === 'school' ? '/app/school/money' : '/app/instructor/money';
  const owed = await pendingRefunds(state.businessId);

  return (
    <>
      {/* Money waiting to be handed over is the one thing here somebody has to act on, so it
          sits above the figures rather than under them (R-08, D-195). */}
      {owed.length > 0 ? (
        <Button variant="secondary" width="full" className="justify-between" asChild>
          <Link href={`${base}/refunds`}>
            <span className="flex items-center gap-2">
              <HandCoins className="size-5 shrink-0" aria-hidden />
              Pending refunds
            </span>
            <span className="flex items-center gap-1">
              <span className="tabular-nums">{formatPence(owed.reduce((total, one) => total + one.amountPence, 0))}</span>
              <ChevronRight className="size-5 shrink-0" aria-hidden />
            </span>
          </Link>
        </Button>
      ) : null}
      <MoneyDashboard businessId={state.businessId} screen={screen} period={period} />
      <Suspense fallback={<SkeletonRow />}>
        <RecentTransactions businessId={state.businessId} base={base} period={period} show={show} />
      </Suspense>
    </>
  );
}

/** What each transaction says, in the words somebody reading their own books would use. */
function transactionLine(one: Transaction): { title: string; detail: string; amount: string } {
  if (one.kind === 'refund') {
    const waiting = one.status === 'pending';
    const way = one.refundKind === 'offline' ? (waiting ? 'To hand back' : 'Handed back') : waiting ? 'Going back to their card' : 'Back to their card';
    return { title: `Refund to ${one.learnerName}`, detail: `${formatDate(one.at)} · ${way}`, amount: `-${formatPence(one.amountPence)}` };
  }

  const how = one.method === 'card' ? 'Card' : one.method === 'cash' ? 'Cash' : one.method === 'bank' ? 'Bank transfer' : 'Paid';
  // A payment is for a lesson or for a package. Say which, and say nothing when it is neither.
  const what = one.creditMinutes === null ? (one.lessonAt === null ? null : 'Lesson') : `Package, ${formatMinutes(one.creditMinutes)}`;
  const back = one.refundedPence > 0 ? `${formatPence(one.refundedPence)} refunded` : null;
  const detail = [formatDate(one.at), what, how, back].filter((part) => part !== null).join(' · ');
  return { title: one.learnerName, detail, amount: formatPence(one.amountPence) };
}

/** MNY-01, D-195: the money itself, newest first, five at a time. */
async function RecentTransactions({
  businessId,
  base,
  period,
  show,
}: {
  businessId: string;
  base: MoneyBase;
  period: MoneyPeriodKey;
  show: number;
}) {
  const page = await moneyTransactions(businessId, show);
  if (!page) return null;

  return (
    <Card className="flex flex-col gap-3" role="region" aria-labelledby="transactions-title">
      <div className="flex flex-col gap-1">
        <CardTitle id="transactions-title">Recent transactions</CardTitle>
        <CardDescription>Every payment and refund, newest first.</CardDescription>
      </div>
      {page.rows.length === 0 ? (
        <p className="text-body text-grey-700">Nothing yet. Payments show up here as soon as they are taken.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-grey-200" aria-label="Payments and refunds">
          {page.rows.map((one) => {
            const line = transactionLine(one);
            return (
              <li key={one.id}>
                <Link
                  href={`/app/instructor/learners/${one.learnerId}`}
                  className="flex min-h-12 items-start gap-3 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-body text-ink">{line.title}</span>
                    <span className="text-small text-grey-700">{line.detail}</span>
                  </span>
                  <span className={`shrink-0 text-body tabular-nums ${one.kind === 'refund' ? 'text-grey-700' : 'text-ink'}`}>
                    {line.amount}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {page.more ? (
        <Button variant="secondary" width="full" asChild>
          {/* A link rather than a button: the next five are fetched on the server, and the page
              keeps its place because nothing above it changes. */}
          <Link
            href={`${base}?period=${period}&show=${String(Math.min(show + PAGE, MOST))}`}
            scroll={false}
          >
            Load more
          </Link>
        </Button>
      ) : null}
    </Card>
  );
}
