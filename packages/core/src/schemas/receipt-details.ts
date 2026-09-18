/**
 * What a Business puts on its receipts: its address, and its VAT number if it is registered
 * (PAY-08, M3-20). Shared by the form and the Server Action.
 */

import { z } from '../zod';
import { normalisePostcode } from '../postcode.ts';

/**
 * A UK VAT number in its canonical form ("GB123456789"), or null when it is not one. Great
 * Britain numbers start GB and Northern Ireland ones XI; the digits are nine, or twelve for a
 * branch, and government departments and health authorities have their own short forms.
 */
export function normaliseVatNumber(value: string): string | null {
  const packed = value.replace(/\s+/g, '').toUpperCase();
  return /^(GB|XI)(\d{9}|\d{12}|GD\d{3}|HA\d{3})$/.test(packed) ? packed : null;
}

export const receiptDetailsSchema = z.object({
  line1: z.string().trim().min(1, { error: 'Add the first line of the address' }).max(100),
  line2: z.string().trim().max(100).default(''),
  town: z.string().trim().min(1, { error: 'Add the town or city' }).max(60),
  postcode: z
    .string()
    .trim()
    .refine((value) => normalisePostcode(value) !== null, { error: 'Enter a UK postcode, like M1 2QF' })
    .transform((value) => normalisePostcode(value) ?? value),
  vatNumber: z
    .string()
    .trim()
    .default('')
    .refine((value) => value === '' || normaliseVatNumber(value) !== null, {
      error: 'Enter a UK VAT number, like GB123456789, or leave it empty',
    })
    .transform((value) => (value === '' ? null : normaliseVatNumber(value))),
});

export type ReceiptDetailsInput = z.input<typeof receiptDetailsSchema>;
export type ReceiptDetails = z.output<typeof receiptDetailsSchema>;
