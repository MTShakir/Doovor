import type { Metadata } from 'next';
import { MoneyScreen } from '@/components/money-screen';

export const metadata: Metadata = { title: 'Money' };

/** PAY-01, SCH-05, MNY-01: a school's money, and the account its learners pay into. */
export default function SchoolMoneyPage({ searchParams }: { searchParams: Promise<{ period?: string | string[] }> }) {
  return <MoneyScreen screen="school" searchParams={searchParams} />;
}
