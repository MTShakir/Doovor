import type { Metadata } from 'next';
import { MoneyScreen } from '@/components/money-screen';

export const metadata: Metadata = { title: 'Money' };

/** PAY-01, SCH-05: a school connects the account its learners pay into. */
export default function SchoolMoneyPage() {
  return <MoneyScreen screen="school" />;
}
