import { paymentModeCopy, type PaymentMode } from '@repo/core/payment-modes';
import { PageHeader } from '@repo/ui/app-shell';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { EmptyState } from '@repo/ui/empty-state';
import { SkeletonRow } from '@repo/ui/skeleton';
import { StatusPill } from '@repo/ui/status-pill';
import { BadgePoundSterling, CreditCard } from 'lucide-react';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { paymentsState, requirementInWords } from '@/lib/payments/connect';
import { ConnectPayments } from '@/app/(portal)/app/instructor/money/connect-payments';
import { PaymentModeChoice } from '@/app/(portal)/app/instructor/money/payment-mode';

export function MoneyScreen({ screen }: { screen: 'instructor' | 'school' }) {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader title="Money" subtitle="Taking payments, and what you are owed." />
      <div className="flex flex-col gap-4 px-4 md:max-w-2xl md:px-8">
        <Suspense fallback={<SkeletonRow />}>
          <Payments screen={screen} />
        </Suspense>
      </div>
    </main>
  );
}

/** PAY-01: where this Business stands with taking card payments. */
async function Payments({ screen }: { screen: 'instructor' | 'school' }) {
  // The provider is asked as the page renders, which a prerendered shell cannot do.
  await connection();
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
    </>
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
