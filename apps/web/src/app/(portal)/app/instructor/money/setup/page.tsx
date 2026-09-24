import type { Metadata } from 'next';
import { PaymentSetupScreen } from '@/components/payment-setup-screen';

export const metadata: Metadata = { title: 'Payment setup' };

/** PAY-01, PAY-03, PAY-08: how an instructor's business gets paid, away from the figures (D-195). */
export default function PaymentSetupPage() {
  return <PaymentSetupScreen screen="instructor" />;
}
