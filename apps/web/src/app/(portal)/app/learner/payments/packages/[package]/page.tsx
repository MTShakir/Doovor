import { cardExpiry, describeCard } from '@repo/core/cards';
import { formatPence } from '@repo/core/money';
import { packageExpiryText, pricePerHourPence } from '@repo/core/packages';
import { formatMinutes } from '@repo/core/time';
import { PageHeader } from '@repo/ui/app-shell';
import { Button } from '@repo/ui/button';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { SkeletonRow } from '@repo/ui/skeleton';
import { StatusPill } from '@repo/ui/status-pill';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { z } from '@repo/core/zod';
import { serverEnv } from '@/env/server';
import { requirePortal } from '@/lib/auth/session';
import { learnerBalance } from '@/lib/payments/balance';
import { keptCardsWith } from '@/lib/payments/cards';
import { packageOffer } from '@/lib/payments/packages';
import { BuyPackage } from './buy-package';

export const metadata: Metadata = { title: 'Buy lesson credit', robots: { index: false } };

export default function BuyPackagePage({ params }: { params: Promise<{ package: string }> }) {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader title="Buy lesson credit" />
      <div className="flex flex-col gap-4 px-4 md:max-w-2xl md:px-8">
        <Suspense fallback={<SkeletonRow />}>
          <Purchase params={params} />
        </Suspense>
      </div>
    </main>
  );
}

function PaymentsButton() {
  return (
    <Button asChild variant="secondary" width="responsive">
      <Link href="/app/learner/payments">Back to payments</Link>
    </Button>
  );
}

/** PAY-04, PAY-12, M3-13: what the package is, what credit means, and the button that buys it. */
async function Purchase({ params }: { params: Promise<{ package: string }> }) {
  // Somebody's own credit and cards, which no shell can know.
  await connection();
  const { session } = await requirePortal('learner');
  const { package: packageId } = await params;
  if (!z.uuid().safeParse(packageId).success) notFound();

  const offer = await packageOffer(packageId);
  if (!offer) notFound();

  const buyable = !offer.suspended && offer.onSale && offer.accountId !== null;
  // The same balance the Payments screen and the instructor's learner card show (M3-16).
  const [credit, kept] = await Promise.all([
    learnerBalance(offer.businessId, session.userId),
    buyable ? keptCardsWith(offer.businessId) : Promise.resolve(null),
  ]);
  const balance = credit?.creditMinutes ?? 0;
  const savedCards = (kept?.cards ?? []).map((card) => ({
    paymentMethodId: card.paymentMethodId,
    label: describeCard(card),
    expiry: cardExpiry(card),
  }));

  return (
    <Card className="flex flex-col gap-4" role="region" aria-labelledby="package-title">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <CardTitle id="package-title">{offer.name}</CardTitle>
          <CardDescription>
            {formatMinutes(offer.minutes)} of lessons with {offer.businessName}
          </CardDescription>
        </div>
        {offer.onSale ? null : <StatusPill status="cancelled">Not sold now</StatusPill>}
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-h2 text-black tabular-nums">{formatPence(offer.pricePence)}</p>
        <p className="text-small text-grey-700 tabular-nums">
          {formatPence(pricePerHourPence(offer))} an hour
        </p>
      </div>

      <ul className="flex list-disc flex-col gap-1 pl-5 text-body text-ink">
        <li>Your lessons with {offer.businessName} are paid from this credit first.</li>
        <li>It is for lessons with {offer.businessName} only.</li>
        <li>{packageExpiryText(offer.expiryDays)}</li>
      </ul>

      {balance > 0 ? (
        <p className="text-body text-ink">
          You have {formatMinutes(balance)} of credit with {offer.businessName} already.
        </p>
      ) : null}

      {offer.suspended ? (
        <div className="flex flex-col gap-3">
          <p className="text-body text-ink">{offer.businessName} is not selling packages at the moment.</p>
          <PaymentsButton />
        </div>
      ) : !offer.onSale ? (
        <div className="flex flex-col gap-3">
          <p className="text-body text-ink">{offer.businessName} no longer sells this package.</p>
          <PaymentsButton />
        </div>
      ) : offer.accountId === null ? (
        <div className="flex flex-col gap-3">
          <p className="text-body text-ink">
            {offer.businessName} cannot take card payments yet. Ask them how to pay for it.
          </p>
          <PaymentsButton />
        </div>
      ) : (
        <BuyPackage
          packageId={offer.packageId}
          attemptId={crypto.randomUUID()}
          name={offer.name}
          minutes={offer.minutes}
          pricePence={offer.pricePence}
          businessName={offer.businessName}
          savedCards={savedCards}
          live={serverEnv.PAYMENTS_PROVIDER === 'stripe'}
        />
      )}
    </Card>
  );
}
