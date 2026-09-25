/**
 * What the books accept (MNY-02, MNY-03, D-198). Shared by the forms and the Server Actions, so
 * the same rules decide both and the messages a person reads are written once.
 *
 * Money arrives as pounds, the way somebody types it, and leaves as pence, because pence are what
 * everything downstream holds. Distance arrives as miles and leaves as tenths, for the same reason.
 */

import { expenseCategories } from '../expenses.ts';
import { tenthsFromMiles } from '../mileage.ts';
import { isUkRegistration, isVehicleYear, normaliseRegistration } from '../vehicle.ts';
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
    /**
     * Which car it was about, or none. A picker's "not about a car" sends an empty string, which
     * is the same answer as leaving it out, so it is read as one rather than refused.
     */
    vehicleId: z
      .union([z.literal(''), z.uuid(), z.null()])
      .optional()
      .transform((value) => (value === '' || value === undefined ? null : value)),
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
  make: z
    .string()
    .trim()
    .min(1, { error: 'Enter the make, like Toyota' })
    .max(40, { error: 'Use 40 characters or fewer' }),
  model: z.string().trim().max(40, { error: 'Use 40 characters or fewer' }).default(''),
  /** Typed as a year, kept as a number. Blank is allowed: an instructor may not remember. */
  year: z
    .string()
    .trim()
    .default('')
    .refine((value) => value === '' || /^[0-9]{4}$/.test(value), { error: 'Enter a year like 2020' })
    .transform((value) => (value === '' ? null : Number(value)))
    .refine((year) => year === null || isVehicleYear(year), { error: 'Enter a year like 2020' }),
  /** Checked against the shapes the DVLA has issued, not the current one alone (D-199). */
  registration: z
    .string()
    .trim()
    .default('')
    .refine((value) => value === '' || isUkRegistration(value), { error: 'Enter a registration like AB12 CDE' })
    .transform((value) => (value === '' ? null : normaliseRegistration(value))),
});

export type VehicleInput = z.input<typeof vehicleInputSchema>;
export type Vehicle = z.output<typeof vehicleInputSchema>;

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
