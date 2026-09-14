import { formatPence } from '@repo/core/money';
import { moneyPeriodKeys, type MoneyPeriodKey } from '@repo/core/money-periods';
import { paymentModeCopy, type PaymentMode } from '@repo/core/payment-modes';
import { formatMinutes } from '@repo/core/time';
import { PageHeader } from '@repo/ui/app-shell';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { EmptyState } from '@repo/ui/empty-state';
import { SkeletonRow } from '@repo/ui/skeleton';
import { StatusPill } from '@repo/ui/status-pill';
import { BadgePoundSterling, CreditCard } from 'lucide-react';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { paymentsState, requirementInWords } from '@/lib/payments/connect';
import { moneySummary } from '@/lib/payments/money-summary';
import { receiptDetails } from '@/lib/payments/receipts';
import { ConnectPayments } from '@/app/(portal)/app/instructor/money/connect-payments';
import { PaymentModeChoice } from '@/app/(portal)/app/instructor/money/payment-mode';
import { ReceiptDetailsForm } from '@/app/(portal)/app/instructor/money/receipt-details';

export function MoneyScreen({
  screen,
  searchParams,
}: {
  screen: 'instructor' | 'school';
  searchParams: Promise<{ period?: string | string[] }>;
}) {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader title="Money" subtitle="Taking payments, and what you are owed." />
      <div className="flex flex-col gap-4 px-4 md:max-w-2xl md:px-8">
        <Suspense fallback={<SkeletonRow />}>
          <Payments screen={screen} searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

const periodTabs: Record<MoneyPeriodKey, string> = { week: 'This week', month: 'This month', tax_year: 'Tax year' };

function periodFrom(value: string | string[] | undefined): MoneyPeriodKey {
  return typeof value === 'string' && (moneyPeriodKeys as readonly string[]).includes(value) ? (value as MoneyPeriodKey) : 'week';
}

/** One figure on the dashboard, with what makes it up underneath. */
function Figure({ label, amount, detail }: { label: string; amount: string; detail: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-card bg-grey-100 px-4 py-3">
      <dt className="text-small text-grey-700">{label}</dt>
      <dd className="flex flex-col">
        <span className="text-h2 text-black tabular-nums">{amount}</span>
        <span className="text-small text-grey-700">{detail}</span>
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
      <dl className="grid gap-3 sm:grid-cols-2" aria-label={summary.period.label}>
        <Figure
          label="Paid"
          amount={formatPence(summary.paid.totalPence)}
          detail={`Card ${formatPence(summary.paid.cardPence)}, cash ${formatPence(summary.paid.cashPence)}, bank ${formatPence(summary.paid.bankPence)}`}
        />
        <Figure label="Unpaid" amount={formatPence(summary.unpaid.totalPence)} detail={`${lessons(summary.unpaid.count)} not paid for`} />
        {summary.creditSold ? (
          <Figure
            label="Credit sold"
            amount={formatPence(summary.creditSold.totalPence)}
            detail={summary.creditSold.minutes === 0 ? 'No packages' : `${formatMinutes(summary.creditSold.minutes)} of lessons`}
          />
        ) : null}
        <Figure
          label="Refunds"
          amount={formatPence(summary.refunds.totalPence)}
          detail={summary.refunds.count === 1 ? '1 refund' : `${String(summary.refunds.count)} refunds`}
        />
      </dl>
    </Card>
  );
}

/** PAY-01: where this Business stands with taking card payments. */
async function Payments({
  screen,
  searchParams,
}: {
  screen: 'instructor' | 'school';
  searchParams: Promise<{ period?: string | string[] }>;
}) {
  // The provider is asked as the page renders, which a prerendered shell cannot do.
  await connection();
  const period = periodFrom((await searchParams).period);
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

  const ready = state.chargesEnabled;
  const started = state.accountId !== null;

  return (
    <>
    <MoneyDashboard businessId={state.businessId} screen={screen} period={period} />
    <Card className="flex flex-col gap-3" role="region" aria-labelledby="payments-title">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <CardTitle id="payments-title">Card payments</CardTitle>
          <CardDescription>
            Learners pay {state.businessName} directly. The money is yours, and we never hold it.
          </CardDescription>
        </div>
        <StatusPill status={ready ? 'confirmed' : started ? 'attention' : 'pending'}>
          {ready ? 'On' : started ? 'Nearly' : 'Off'}
        </StatusPill>
      </div>

      {ready ? (
        <p className="flex items-center gap-2 text-body text-ink">
          <CreditCard className="size-5 shrink-0 text-grey-700" aria-hidden />
          You can take card, Apple Pay and Google Pay.
          {state.payoutsEnabled ? '' : ' Payouts are still being set up.'}
        </p>
      ) : (
        <p className="text-body text-grey-700">
          {started
            ? 'Your account is made. There are a few things left before you can take payments.'
            : 'Set this up once and learners can pay when they book.'}
        </p>
      )}

      {state.requirements.length > 0 ? (
        <div className="flex flex-col gap-1">
          <h3 className="text-small font-semibold text-black">Still needed</h3>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-small text-grey-700">
            {state.requirements.slice(0, 6).map((requirement) => (
              <li key={requirement}>{requirementInWords(requirement)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {state.stale ? (
        <p className="text-small text-grey-700">
          We could not reach the payments service just now, so this may be out of date.
        </p>
      ) : null}

      {state.canManage ? (
        <ConnectPayments started={started} ready={ready} screen={screen} />
      ) : (
        <p className="text-small text-grey-700">Only the owner of the business can set payments up.</p>
      )}
    </Card>
    {ready ? <HowLearnersPay mode={state.paymentMode} canManage={state.canManage} /> : null}
    <Receipts businessId={state.businessId} canManage={state.canManage} />
    </>
  );
}

/** PAY-08, M3-20: what goes on the receipts learners are sent, set by the owner. */
async function Receipts({ businessId, canManage }: { businessId: string; canManage: boolean }) {
  const details = await receiptDetails(businessId);
  const lines = [details.line1, details.line2, details.town, details.postcode].filter((line) => line.trim() !== '');

  return (
    <Card className="flex flex-col gap-3" role="region" aria-labelledby="receipts-title">
      <div className="flex flex-col gap-1">
        <CardTitle id="receipts-title">Receipts</CardTitle>
        <CardDescription>Every payment gets a numbered receipt by email, with your address on it.</CardDescription>
      </div>
      {canManage ? (
        <ReceiptDetailsForm initial={details} />
      ) : (
        <div className="flex flex-col gap-1">
          {lines.length === 0 ? (
            <p className="text-body text-grey-700">No address yet. The owner of the business adds it.</p>
          ) : (
            lines.map((line) => (
              <p key={line} className="text-body text-ink">
                {line}
              </p>
            ))
          )}
          {details.vatNumber === '' ? null : <p className="text-body text-ink">VAT number {details.vatNumber}</p>}
        </div>
      )}
    </Card>
  );
}

/** The ways of paying this app can take today, in the order an owner reads them (PAY-03). */
const choices: PaymentMode[] = ['at_booking', 'before_lesson', 'after_lesson', 'offline'];

/** PAY-03: once cards can be taken, the owner decides when learners are asked for one. */
function HowLearnersPay({ mode, canManage }: { mode: PaymentMode; canManage: boolean }) {
  return (
    <Card className="flex flex-col gap-3" role="region" aria-labelledby="payment-mode-title">
      <div className="flex flex-col gap-1">
        <CardTitle id="payment-mode-title">How learners pay</CardTitle>
        <CardDescription>Credit a learner has already bought is always used first.</CardDescription>
      </div>
      {canManage ? (
        <PaymentModeChoice current={mode} choices={choices.includes(mode) ? choices : [...choices, mode]} />
      ) : (
        <p className="text-body text-ink">
          Learners pay {paymentModeCopy[mode].label.toLowerCase()}. {paymentModeCopy[mode].description}
        </p>
      )}
    </Card>
  );
}
