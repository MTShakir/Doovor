import { cardExpiry, describeCard } from '@repo/core/cards';
import { formatPence } from '@repo/core/money';
import { pricePerHourPence } from '@repo/core/packages';
import { formatMinutes } from '@repo/core/time';
import { PageHeader } from '@repo/ui/app-shell';
import { Card, CardTitle } from '@repo/ui/card';
import { EmptyState } from '@repo/ui/empty-state';
import { SkeletonRow } from '@repo/ui/skeleton';
import { ChevronRight, CreditCard } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { requirePortal } from '@/lib/auth/session';
import { keptCardsByBusiness } from '@/lib/payments/cards';
import { creditWithBusinesses } from '@/lib/payments/packages';
import { KeptCards } from './kept-cards';

export const metadata: Metadata = { title: 'Payments', robots: { index: false } };

export default function LearnerPaymentsPage() {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader title="Payments" subtitle="Your lesson credit, and the cards your instructors keep for you." />
      <div className="flex flex-col gap-6 px-4 md:max-w-2xl md:px-8">
        <Suspense fallback={<SkeletonRow />}>
          <Credit />
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
 * PAY-04, PAY-06, M3-13: credit with each Business the learner learns with, and the packages
 * that buy more. Credit only ever belongs to one Business, so it is shown one Business at a time.
 */
async function Credit() {
  // Somebody's own credit, which no shell can know.
  await connection();
  const { session } = await requirePortal('learner');
  const businesses = await creditWithBusinesses(session.userId);
  if (businesses.length === 0) return null;

  return (
    <section className="flex flex-col gap-2" aria-labelledby="lesson-credit">
      <h2 id="lesson-credit" className="text-h3 text-black">
        Lesson credit
      </h2>
      {businesses.map((business) => (
        <Card key={business.businessId} padding="none" role="region" aria-label={`Credit with ${business.businessName}`}>
          <div className="flex flex-col gap-1 px-4 pt-4 pb-3">
            <CardTitle>{business.businessName}</CardTitle>
            <p className="text-body text-ink tabular-nums">
              {business.balanceMinutes > 0 ? `${formatMinutes(business.balanceMinutes)} of credit` : 'No credit yet'}
            </p>
          </div>
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
