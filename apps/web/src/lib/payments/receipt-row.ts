import type { BusinessAddress, Receipt, ReceiptKind, ReceiptMethod } from '@repo/core/receipts';

/** A receipt row as the database keeps it, for anybody who reads receipts the same way. */
export interface ReceiptRow {
  id: string;
  payment_id: string;
  number: number;
  issued_at: string;
  business_name: string;
  business_address: unknown;
  vat_number: string | null;
  vat_rate_percent: number | null;
  vat_pence: number | null;
  amount_pence: number;
  method: string;
  kind: string;
  lesson_starts_at: string | null;
  lesson_minutes: number | null;
  lesson_type: string | null;
  instructor_name: string | null;
  credit_minutes: number | null;
}

function isAddress(value: unknown): value is BusinessAddress {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The receipt, in the shape packages/core/src/receipts.ts turns into words. */
export function receiptFromRow(row: ReceiptRow): Receipt {
  return {
    number: row.number,
    issuedAt: new Date(row.issued_at),
    businessName: row.business_name,
    businessAddress: isAddress(row.business_address) ? row.business_address : null,
    vatNumber: row.vat_number,
    vatRatePercent: row.vat_rate_percent,
    vatPence: row.vat_pence,
    amountPence: row.amount_pence,
    method: row.method as ReceiptMethod,
    kind: row.kind as ReceiptKind,
    lessonStartsAt: row.lesson_starts_at === null ? null : new Date(row.lesson_starts_at),
    lessonMinutes: row.lesson_minutes,
    lessonType: row.lesson_type,
    instructorName: row.instructor_name,
    creditMinutes: row.credit_minutes,
  };
}
