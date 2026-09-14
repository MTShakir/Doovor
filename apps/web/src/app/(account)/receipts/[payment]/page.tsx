import { formatPence } from '@repo/core/money';
import { receiptWords } from '@repo/core/receipts';
import { Card } from '@repo/ui/card';
import { SkeletonRow } from '@repo/ui/skeleton';
import { ChevronLeft } from 'lucide-react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { landingPath } from '@/lib/auth/portals';
import { requireAccess } from '@/lib/auth/session';
import { receiptForPayment } from '@/lib/payments/receipts';
import { PrintButton } from './print-button';

export const metadata: Metadata = { title: 'Receipt', robots: { index: false } };

export default function ReceiptPage({ params }: { params: Promise<{ payment: string }> }) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-2 pt-8" aria-busy>
          <SkeletonRow />
          <SkeletonRow />
        </div>
      }
    >
      <ReceiptView params={params} />
    </Suspense>
  );
}

/** PAY-08, M3-20: a receipt to read, print or keep, the same one the learner was emailed. */
async function ReceiptView({ params }: { params: Promise<{ payment: string }> }) {
  // Somebody's own receipt, which a prerendered shell cannot know.
  await connection();
  const { access } = await requireAccess();
  const { payment } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(payment)) notFound();

  const found = await receiptForPayment(payment);
  if (!found) notFound();
  const words = receiptWords(found.receipt);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link
          href={landingPath(access) as Route}
          className="-ml-3 flex h-12 w-fit items-center gap-1 rounded-full px-3 text-body font-medium text-ink hover:bg-grey-100"
        >
          <ChevronLeft size={20} strokeWidth={1.5} aria-hidden />
          Back
        </Link>
        <PrintButton />
      </div>

      <Card className="flex flex-col gap-6 print:border-0 print:p-0" role="region" aria-labelledby="receipt-title">
        <div className="flex flex-col gap-1">
          <h1 id="receipt-title" className="text-h1 text-black">
            {words.title}
          </h1>
          <p className="text-body text-grey-700">{words.issuedOn}</p>
        </div>

        <address className="flex flex-col not-italic">
          <span className="text-body font-semibold text-black">{words.businessName}</span>
          {words.addressLines.map((line) => (
            <span key={line} className="text-body text-grey-700">
              {line}
            </span>
          ))}
          {words.vat ? <span className="text-body text-grey-700">{words.vat.number}</span> : null}
        </address>

        <dl className="flex flex-col border-t border-grey-200">
          <div className="flex items-start justify-between gap-4 border-b border-grey-200 py-3">
            <dt className="text-body text-ink">{words.line}</dt>
            <dd className="shrink-0 text-body text-ink tabular-nums">{words.total}</dd>
          </div>
          {words.vat ? (
            <div className="flex items-start justify-between gap-4 border-b border-grey-200 py-3">
              <dt className="text-body text-ink">{words.vat.label}</dt>
              <dd className="shrink-0 text-body text-ink tabular-nums">{words.vat.amount}</dd>
            </div>
          ) : null}
          <div className="flex items-start justify-between gap-4 py-3">
            <dt className="flex flex-col">
              <span className="text-body font-semibold text-black">Total</span>
              <span className="text-small text-grey-700">{words.paidBy}</span>
            </dt>
            <dd className="shrink-0 text-body font-semibold text-black tabular-nums">{words.total}</dd>
          </div>
        </dl>

        {found.refundedPence > 0 ? (
          <p className="text-body text-ink">
            {found.refundedPence >= found.receipt.amountPence
              ? 'This payment has since been refunded.'
              : `${formatPence(found.refundedPence)} of this payment has since been refunded.`}
          </p>
        ) : null}
      </Card>
    </div>
  );
}
