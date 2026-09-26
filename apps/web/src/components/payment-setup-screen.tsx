import { paymentModeCopy, type PaymentMode } from '@repo/core/payment-modes';
import { PageHeader } from '@repo/ui/app-shell';
import { BackLink } from '@/components/back-link';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { EmptyState } from '@repo/ui/empty-state';
import { SkeletonRow } from '@repo/ui/skeleton';
import { StatusPill } from '@repo/ui/status-pill';
import { BadgePoundSterling, CreditCard } from 'lucide-react';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { paymentsState, requirementInWords, type PaymentsAccount } from '@/lib/payments/connect';
import { receiptDetails } from '@/lib/payments/receipts';
import { AcceptPayments } from '@/app/(portal)/app/instructor/money/accept-payments';
import { ConnectPayments } from '@/app/(portal)/app/instructor/money/connect-payments';
import { PaymentModeChoice } from '@/app/(portal)/app/instructor/money/payment-mode';
import { ReceiptDetailsForm } from '@/app/(portal)/app/instructor/money/receipt-details';

/**
 * Setting up how a Business gets paid (PAY-01, PAY-03, PAY-08, D-195).
 *
 * This used to sit under the figures on the Money screen, where it was read once and then scrolled
 * past every day after. It is a setting, so it lives with the settings: the Money screen is now
 * only about money that has actually moved.
 */
export function PaymentSetupScreen({ screen }: { screen: 'instructor' | 'school' }) {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <BackLink href={screen === 'school' ? '/app/school/money' : '/app/instructor/money'}>Money</BackLink>
      <PageHeader title="Payment setup" subtitle="How learners pay you, and what goes on their receipts." />
      <div className="flex flex-col gap-4 px-4 md:max-w-2xl md:px-8">
        <Suspense fallback={<SkeletonRow />}>
          <Setup screen={screen} />
        </Suspense>
      </div>
    </main>
  );
}

async function Setup({ screen }: { screen: 'instructor' | 'school' }) {
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

  const accepting = state.paymentMode !== 'offline';

  return (
    <>
      <Card className="flex flex-col gap-3" role="region" aria-labelledby="accept-title">
        <div className="flex flex-col gap-1">
          <CardTitle id="accept-title">Online payments</CardTitle>
          <CardDescription>Turn this off to be paid in person only.</CardDescription>
        </div>
        {state.canManage ? (
          <AcceptPayments on={accepting} ready={state.chargesEnabled} />
        ) : (
          <p className="text-body text-ink">
            {accepting ? 'Learners can pay this business online.' : 'Learners pay this business in person.'}
          </p>
        )}
      </Card>

      {/* The account and its payouts are the owner's: nobody else sees them (PRD 6.2, acceptance test 11). */}
      {state.account ? (
        <CardPayments account={state.account} businessName={state.businessName} ready={state.chargesEnabled} screen={screen} />
      ) : null}
      {state.chargesEnabled && accepting ? <HowLearnersPay mode={state.paymentMode} canManage={state.canManage} /> : null}
      <Receipts businessId={state.businessId} canManage={state.canManage} />
    </>
  );
}

/** PAY-01: the owner's payments account, and whether its payouts are set up. */
function CardPayments({
  account,
  businessName,
  ready,
  screen,
}: {
  account: PaymentsAccount;
  businessName: string;
  ready: boolean;
  screen: 'instructor' | 'school';
}) {
  const started = account.accountId !== null;
  return (
    <Card className="flex flex-col gap-3" role="region" aria-labelledby="payments-title">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <CardTitle id="payments-title">Card payments</CardTitle>
          <CardDescription>
            Learners pay {businessName} directly. The money is yours, and we never hold it.
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
          {account.payoutsEnabled ? '' : ' Payouts are still being set up.'}
        </p>
      ) : (
        <p className="text-body text-grey-700">
          {started
            ? 'Your account is made. There are a few things left before you can take payments.'
            : 'Set this up once and learners can pay when they book.'}
        </p>
      )}

      {account.requirements.length > 0 ? (
        <div className="flex flex-col gap-1">
          <h3 className="text-small font-semibold text-black">Still needed</h3>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-small text-grey-700">
            {account.requirements.slice(0, 6).map((requirement) => (
              <li key={requirement}>{requirementInWords(requirement)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {account.stale ? (
        <p className="text-small text-grey-700">
          We could not reach the payments service just now, so this may be out of date.
        </p>
      ) : null}

      <ConnectPayments started={started} ready={ready} screen={screen} />
    </Card>
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
const choices: PaymentMode[] = ['at_booking', 'before_lesson', 'after_lesson'];

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
