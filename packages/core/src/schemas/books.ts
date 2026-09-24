/**
 * What the books accept (MNY-02, MNY-03, D-198). Shared by the forms and the Server Actions, so
 * the same rules decide both and the messages a person reads are written once.
 *
 * Money arrives as pounds, the way somebody types it, and leaves as pence, because pence are what
 * everything downstream holds. Distance arrives as miles and leaves as tenths, for the same reason.
 */

import { expenseCategories } from '../expenses.ts';
import { tenthsFromMiles } from '../mileage.ts';
import { z } from '../zod';

/** Pounds as typed, into pence. Rejects anything that is not an amount of money. */
export const poundsSchema = z
  .string()
  .trim()
  .regex(/^\d{1,7}(\.\d{1,2})?$/, { error: 'Enter an amount like 42.50' })
  .transform((value) => Math.round(Number(value) * 100))
  .refine((pence) => pence > 0, { error: 'Enter an amount more than nothing' });

/** The same, but blank means none. */
export const optionalPoundsSchema = z
  .string()
  .trim()
  .default('')
  .refine((value) => value === '' || /^\d{1,7}(\.\d{1,2})?$/.test(value), { error: 'Enter an amount like 8.40, or leave it blank' })
  .transform((value) => (value === '' ? 0 : Math.round(Number(value) * 100)));

export const expenseInputSchema = z
  .object({
    category: z.enum(expenseCategories),
    spentOn: z.iso.date({ error: 'Choose the day the money went out' }),
    amount: poundsSchema,
    vat: optionalPoundsSchema,
    note: z.string().trim().max(500, { error: 'Use 500 characters or fewer' }).default(''),
    /** Where the photographed receipt was stored. The server checks it belongs to this Business. */
    receiptPath: z.string().max(200).nullish(),
    vehicleId: z.uuid().nullish(),
  })
  .refine((value) => value.vat <= value.amount, {
    error: 'The VAT cannot be more than the amount it is inside',
    path: ['vat'],
  });

export type ExpenseInput = z.input<typeof expenseInputSchema>;
export type Expense = z.output<typeof expenseInputSchema>;

export const mileageInputSchema = z.object({
  vehicleId: z.uuid({ error: 'Choose which car' }),
  travelledOn: z.iso.date({ error: 'Choose the day you drove it' }),
  miles: z
    .string()
    .trim()
    .transform((value) => tenthsFromMiles(value))
    .refine((tenths): tenths is number => tenths !== null, { error: 'Enter a distance like 12 or 7.5' }),
  note: z.string().trim().max(500, { error: 'Use 500 characters or fewer' }).default(''),
});

export type MileageInput = z.input<typeof mileageInputSchema>;
export type Mileage = z.output<typeof mileageInputSchema>;

export const vehicleInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: 'Give the car a name' })
    .max(60, { error: 'Use 60 characters or fewer' }),
});

export type VehicleInput = z.infer<typeof vehicleInputSchema>;

export const vatInputSchema = z
  .object({
    registered: z.boolean(),
    number: z.string().trim().default(''),
  })
  .refine((value) => !value.registered || value.number !== '', {
    error: 'Enter your VAT number',
    path: ['number'],
  });

export type VatInput = z.input<typeof vatInputSchema>;
export type Vat = z.output<typeof vatInputSchema>;
