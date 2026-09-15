import { cardExpiry, describeCard } from '@repo/core/cards';
import { formatPence } from '@repo/core/money';
import { pricePerHourPence } from '@repo/core/packages';
import { PageHeader } from '@repo/ui/app-shell';
import { Button } from '@repo/ui/button';
import { Card, CardTitle } from '@repo/ui/card';
import { EmptyState } from '@repo/ui/empty-state';
import { SkeletonRow } from '@repo/ui/skeleton';
import { ChevronRight, CreditCard } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { BalanceHistory, BalanceLines, OwedLessons } from '@/components/money/balance';
import { requirePortal } from '@/lib/auth/session';
import { learnerBalance, type Balance } from '@/lib/payments/balance';
import { keptCardsByBusiness } from '@/lib/payments/cards';
import { learnerBusinesses, type LearnerBusiness } from '@/lib/payments/packages';
import { KeptCards } from './kept-cards';

export const metadata: Metadata = { title: 'Payments', robots: { index: false } };

export default function LearnerPaymentsPage() {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader title="Payments" subtitle="Your credit, what you owe, and the cards your instructors keep for you." />
      <div className="flex flex-col gap-6 px-4 md:max-w-2xl md:px-8">
        <Suspense fallback={<SkeletonRow />}>
          <Balances />
        </Suspense>
        <section className="flex flex-col gap-2" aria-labelledby="saved-cards">
          <h2 id="saved-cards" className="text-h3 text-black">
            Saved cards
          </h2>
          <Suspense fallback={<SkeletonRow />}>
            <SavedCards />
          </Suspense>
        </section>
      </div>
    </main>
  );
}

/**
 * PAY-04, PAY-06, M3-13, M3-16: the learner's balance with each Business they learn with, the
 * same one their instructor sees on the learner card: credit, what is owed and since when, the
 * packages that buy more, and what has happened lately. Credit and money only ever belong to one
 * Business, so they are shown one Business at a time.
 */
async function Balances() {
  // Somebody's own money, which no shell can know.
  await connection();
  const { session } = await requirePortal('learner');
  const businesses = await learnerBusinesses(session.userId);
  const balances = await Promise.all(businesses.map((one) => learnerBalance(one.businessId, session.userId)));

  const shown = businesses
    .map((business, index) => ({ business, balance: balances[index] ?? null }))
    .filter((one): one is { business: LearnerBusiness; balance: Balance } => {
      const { business, balance } = one;
      if (balance === null) return false;
      return balance.creditMinutes > 0 || balance.owedPence > 0 || balance.history.length > 0 || business.packages.length > 0;
    });
  if (shown.length === 0) return null;

  return (
    <section className="flex flex-col gap-2" aria-labelledby="balances">
      <h2 id="balances" className="text-h3 text-black">
        Credit and balances
      </h2>
      {shown.map(({ business, balance }) => (
        <Card key={business.businessId} padding="none" role="region" aria-label={`Balance with ${business.businessName}`}>
          <div className="flex flex-col gap-2 px-4 pt-4 pb-3">
            <CardTitle>{business.businessName}</CardTitle>
            <BalanceLines balance={balance} />
          </div>
          <OwedLessons
            balance={balance}
            action={
              // Paid on screen where the Business takes cards, and in person where it does not. A fee
              // is paid the same way as a lesson (PAY-09).
              business.takesCards
                ? (owed) => (
                    <Button asChild>
                      <Link href={`/app/learner/pay/${owed.lesson.id}`}>Pay {formatPence(owed.amountPence)}</Link>
                    </Button>
                  )
                : undefined
            }
          />
          {business.packages.length === 0 ? null : (
            <ul className="flex flex-col border-t border-grey-200">
              {business.packages.map((offer) => (
                <li key={offer.packageId} className="border-b border-grey-200 last:border-b-0">
                  <Link
                    href={`/app/learner/payments/packages/${offer.packageId}`}
                    className="flex min-h-12 items-center gap-3 px-4 py-2 hover:bg-grey-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-black"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-body font-medium text-ink">Buy {offer.name}</span>
                      <span className="text-small text-grey-700 tabular-nums">
                        {formatPence(offer.pricePence)}, {formatPence(pricePerHourPence(offer))} an hour
                      </span>
                    </span>
                    <ChevronRight className="size-5 shrink-0 text-grey-700" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <BalanceHistory history={balance.history} limit={5} />
        </Card>
      ))}
    </section>
  );
}

/** PAY-02, M3-07: every Business the learner has kept a card with, and the cards themselves. */
async function SavedCards() {
  // Somebody's own cards, which the provider holds and no shell can know.
  await connection();
  await requirePortal('learner');
  const kept = (await keptCardsByBusiness()).filter((one) => one.cards.length > 0);

  if (kept.length === 0) {
    return (
      <Card padding="none">
        <EmptyState
          icon={CreditCard}
          title="No saved cards"
          description="When you pay for a lesson you can save the card, so the next one takes a single press."
        />
      </Card>
    );
  }

  return kept.map((one) => (
    <KeptCards
      key={one.businessId}
      businessId={one.businessId}
      businessName={one.businessName}
      cards={one.cards.map((card) => ({
        paymentMethodId: card.paymentMethodId,
        label: describeCard(card),
        expiry: cardExpiry(card),
      }))}
    />
  ));
}
