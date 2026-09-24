import type { Metadata } from 'next';
import { PendingRefundsScreen } from '@/components/pending-refunds-screen';

export const metadata: Metadata = { title: 'Pending refunds' };

/** R-08, PAY-07: money owed back in person, and not yet handed over (D-195). */
export default function PendingRefundsPage() {
  return <PendingRefundsScreen screen="instructor" />;
}
