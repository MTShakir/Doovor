import type { Metadata } from 'next';
import { MoneyScreen } from '@/components/money-screen';

export const metadata: Metadata = { title: 'Money' };

/** PAY-01, MNY-01: an instructor's money, and connecting payments for a Business they own. */
export default function MoneyPage({ searchParams }: { searchParams: Promise<{ period?: string | string[] }> }) {
  return <MoneyScreen screen="instructor" searchParams={searchParams} />;
}
