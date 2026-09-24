import type { Metadata } from 'next';
import { PaymentSetupScreen } from '@/components/payment-setup-screen';

export const metadata: Metadata = { title: 'Payment setup' };

/** PAY-01, PAY-03, PAY-08, SCH-05: how a school gets paid (D-195). */
export default function SchoolPaymentSetupPage() {
  return <PaymentSetupScreen screen="school" />;
}
