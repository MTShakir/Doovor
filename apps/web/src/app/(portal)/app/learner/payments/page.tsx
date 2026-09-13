import { cardExpiry, describeCard } from '@repo/core/cards';
import { PageHeader } from '@repo/ui/app-shell';
import { Card } from '@repo/ui/card';
import { EmptyState } from '@repo/ui/empty-state';
import { SkeletonRow } from '@repo/ui/skeleton';
import { CreditCard } from 'lucide-react';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { requirePortal } from '@/lib/auth/session';
import { keptCardsByBusiness } from '@/lib/payments/cards';
import { KeptCards } from './kept-cards';

export const metadata: Metadata = { title: 'Payments', robots: { index: false } };

export default function LearnerPaymentsPage() {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader title="Payments" subtitle="The cards your instructors keep for you." />
      <div className="flex flex-col gap-4 px-4 md:max-w-2xl md:px-8">
        <Suspense fallback={<SkeletonRow />}>
          <SavedCards />
        </Suspense>
      </div>
    </main>
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
