import type { Metadata } from 'next';
import { MoneyScreen } from '@/components/money-screen';

export const metadata: Metadata = { title: 'Money' };

/** PAY-01: an instructor who owns their own Business connects payments here. */
export default function MoneyPage() {
  return <MoneyScreen screen="instructor" />;
}
