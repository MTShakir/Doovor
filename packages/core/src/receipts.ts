/**
 * What a receipt says (PAY-08, M3-20).
 *
 * The database issues a receipt with its number and freezes what it says; this turns those facts
 * into the words the email and the receipt page both use, so the two cannot disagree.
 */

import { formatPence } from './money.ts';
import { formatDate, formatDateWithYear, formatMinutes, formatTime } from './time/format.ts';

export type ReceiptKind = 'lesson' | 'late_cancellation_fee' | 'no_show_fee' | 'credit' | 'other';

export type ReceiptMethod = 'card' | 'cash' | 'bank' | 'credit';

/** A Business's address as it is kept: any of the parts may be missing. */
export interface BusinessAddress {
  line1?: string | null;
  line2?: string | null;
  town?: string | null;
  postcode?: string | null;
}

export interface Receipt {
  number: number;
  issuedAt: Date;
  businessName: string;
  businessAddress: BusinessAddress | null;
  vatNumber: string | null;
  vatRatePercent: number | null;
  vatPence: number | null;
  amountPence: number;
  method: ReceiptMethod;
  kind: ReceiptKind;
  lessonStartsAt: Date | null;
  lessonMinutes: number | null;
  lessonType: string | null;
  instructorName: string | null;
  creditMinutes: number | null;
}

/** The lines of an address, in order, leaving out what is not there. */
export function addressLines(address: BusinessAddress | null): string[] {
  if (address === null) return [];
  return [address.line1, address.line2, address.town, address.postcode]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter((part) => part !== '');
}

/** "Receipt 42": numbered one after another for each Business. */
export function receiptTitle(receipt: Pick<Receipt, 'number'>): string {
  return `Receipt ${String(receipt.number)}`;
}

function lessonWhen(receipt: Receipt): string {
  return receipt.lessonStartsAt === null ? '' : ` on ${formatDate(receipt.lessonStartsAt)} at ${formatTime(receipt.lessonStartsAt)}`;
}

/** What was paid for, in one line. */
export function receiptLine(receipt: Receipt): string {
  switch (receipt.kind) {
    case 'lesson': {
      const length = receipt.lessonMinutes === null ? '' : `, ${formatMinutes(receipt.lessonMinutes)}`;
      const withWhom = receipt.instructorName === null ? '' : ` with ${receipt.instructorName}`;
      return `${receipt.lessonType ?? 'Lesson'}${length}${lessonWhen(receipt)}${withWhom}`;
    }
    case 'late_cancellation_fee':
      return `Late cancellation fee for the lesson${lessonWhen(receipt)}`;
    case 'no_show_fee':
      return `No-show fee for the lesson${lessonWhen(receipt)}`;
    case 'credit':
      return receipt.creditMinutes === null ? 'Lesson credit' : `${formatMinutes(receipt.creditMinutes)} of lesson credit`;
    case 'other':
      return 'Payment';
  }
}

const methods: Record<ReceiptMethod, string> = {
  card: 'Paid by card',
  cash: 'Paid in cash',
  bank: 'Paid by bank transfer',
  credit: 'Paid with credit',
};

export interface ReceiptWords {
  title: string;
  issuedOn: string;
  businessName: string;
  addressLines: string[];
  line: string;
  total: string;
  paidBy: string;
  /** Only for a Business registered for VAT (PAY-08). */
  vat: { label: string; amount: string; number: string } | null;
}

/** Everything a receipt says, in the words both the email and the page use. */
export function receiptWords(receipt: Receipt): ReceiptWords {
  return {
    title: receiptTitle(receipt),
    issuedOn: formatDateWithYear(receipt.issuedAt),
    businessName: receipt.businessName,
    addressLines: addressLines(receipt.businessAddress),
    line: receiptLine(receipt),
    total: formatPence(receipt.amountPence),
    paidBy: methods[receipt.method],
    vat:
      receipt.vatPence === null || receipt.vatNumber === null || receipt.vatRatePercent === null
        ? null
        : {
            label: `VAT at ${String(receipt.vatRatePercent)}% included`,
            amount: formatPence(receipt.vatPence),
            number: `VAT number ${receipt.vatNumber}`,
          },
  };
}
