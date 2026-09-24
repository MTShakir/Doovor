import type { Metadata } from 'next';
import { PendingRefundsScreen } from '@/components/pending-refunds-screen';

export const metadata: Metadata = { title: 'Pending refunds' };

/** R-08, PAY-07, SCH-05: money a school owes back in person (D-195). */
export default function SchoolPendingRefundsPage() {
  return <PendingRefundsScreen screen="school" />;
}
