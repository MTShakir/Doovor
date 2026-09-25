'use server';

import { parsePostgresError } from '@repo/core/errors';
import { err, ok, type Result } from '@repo/core/result';
import {
  expenseInputSchema,
  mileageInputSchema,
  vatInputSchema,
  vehicleInputSchema,
} from '@repo/core/schemas/books';
import { z } from '@repo/core/zod';
import { revalidatePath } from 'next/cache';
import { booksAccess } from '@/lib/books/books';
import { fieldErrors } from '@/lib/forms';
import { receiptsBucket, removeProfileImage } from '@/lib/storage/images';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { refuseWhileViewing } from '@/lib/auth/view-as';

/** Every screen of the books, so a change on one shows on the others. */
function revalidateBooks(): void {
  for (const path of ['', '/expenses', '/mileage', '/setup', '/export']) {
    revalidatePath(`/app/instructor/books${path}`);
  }
}

/** The books are the owner's, and only on a Business that is their own. */
async function keeper(): Promise<{ businessId: string } | { problem: Result<never> }> {
  const access = await booksAccess();
  if (!access) return { problem: err('NOT_ALLOWED') };
  if (!access.solo) return { problem: err('NOT_ALLOWED', 'Bookkeeping for schools is coming soon.') };
  if (!access.included) return { problem: err('NOT_ALLOWED', 'Bookkeeping is part of the Pro plan.') };
  return { businessId: access.businessId };
}

/** MNY-02: what went out, on the day it went out. */
export async function recordExpense(input: unknown): Promise<Result<{ id: string }>> {
  const refused = await refuseWhileViewing();
  if (refused) return refused;
  const parsed = expenseInputSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  const who = await keeper();
  if ('problem' in who) return who.problem;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('record_expense', {
    p_business_id: who.businessId,
    p_category: parsed.data.category,
    p_spent_on: parsed.data.spentOn,
    p_amount_pence: parsed.data.amount,
    p_vat_pence: parsed.data.vat,
    p_note: parsed.data.note === '' ? undefined : parsed.data.note,
    p_receipt_path: parsed.data.receiptPath ?? undefined,
    p_vehicle_id: parsed.data.vehicleId ?? undefined,
  });
  if (error) {
    const problem = parsePostgresError(error);
    if (problem.code === 'CLAIMED_BY_MILEAGE') {
      return err('CLAIMED_BY_MILEAGE', 'That car is claimed by the mile, so what it costs to run cannot be claimed as well.');
    }
    return err(problem.code);
  }

  revalidateBooks();
  return ok({ id: data });
}

const removeSchema = z.object({ id: z.uuid() });

/** MNY-02: a mistake taken back out, and its picture with it. */
export async function removeExpense(input: unknown): Promise<Result<null>> {
  const refused = await refuseWhileViewing();
  if (refused) return refused;
  const parsed = removeSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');

  const who = await keeper();
  if ('problem' in who) return who.problem;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('remove_expense', { p_expense_id: parsed.data.id });
  if (error) return err(parsePostgresError(error).code);

  // The row is gone, so the picture is nobody's. A failure here leaves a file nobody can reach,
  // which the nightly tidy-up takes care of (D-158).
  const path = (data as { receipt_path?: string | null } | null)?.receipt_path;
  if (typeof path === 'string' && path !== '') {
    await removeProfileImage(supabase, receiptsBucket, path);
  }

  revalidateBooks();
  return ok(null);
}

/** MNY-03: a car to keep costs or miles against. */
export async function addVehicle(input: unknown): Promise<Result<{ id: string }>> {
  const refused = await refuseWhileViewing();
  if (refused) return refused;
  const parsed = vehicleInputSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  const who = await keeper();
  if ('problem' in who) return who.problem;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('add_vehicle', {
    p_business_id: who.businessId,
    p_make: parsed.data.make,
    p_model: parsed.data.model === '' ? undefined : parsed.data.model,
    p_year: parsed.data.year ?? undefined,
    p_registration: parsed.data.registration ?? undefined,
  });
  if (error) {
    const problem = parsePostgresError(error);
    if (problem.code === 'DUPLICATE_VEHICLE') {
      return err('DUPLICATE_VEHICLE', undefined, { registration: 'That registration is already one of your cars.' });
    }
    return err(problem.code);
  }

  revalidateBooks();
  return ok({ id: data });
}

/**
 * MNY-03: a car that has gone, without taking its history with it (D-199).
 *
 * Retired rather than deleted: what was claimed against it is part of a financial record, and a
 * record with a hole in it is worse than one with a car nobody drives any more.
 */
export async function retireVehicle(input: unknown): Promise<Result<null>> {
  const refused = await refuseWhileViewing();
  if (refused) return refused;
  const parsed = removeSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');

  const who = await keeper();
  if ('problem' in who) return who.problem;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('retire_vehicle', { p_vehicle_id: parsed.data.id });
  if (error) return err(parsePostgresError(error).code);

  revalidateBooks();
  return ok(null);
}

/** MNY-03: a trip, against the car that made it. */
export async function recordMileage(input: unknown): Promise<Result<{ id: string }>> {
  const refused = await refuseWhileViewing();
  if (refused) return refused;
  const parsed = mileageInputSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  const who = await keeper();
  if ('problem' in who) return who.problem;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('record_mileage', {
    p_business_id: who.businessId,
    p_vehicle_id: parsed.data.vehicleId,
    p_travelled_on: parsed.data.travelledOn,
    p_miles_tenths: parsed.data.miles,
    p_note: parsed.data.note === '' ? undefined : parsed.data.note,
  });
  if (error) {
    const problem = parsePostgresError(error);
    if (problem.code === 'CLAIMED_ON_COSTS') {
      return err('CLAIMED_ON_COSTS', 'That car is claimed on what it actually costs, so its miles cannot be claimed as well.');
    }
    return err(problem.code);
  }

  revalidateBooks();
  return ok({ id: data });
}

/** MNY-03: a trip taken back out. */
export async function removeMileage(input: unknown): Promise<Result<null>> {
  const refused = await refuseWhileViewing();
  if (refused) return refused;
  const parsed = removeSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');

  const who = await keeper();
  if ('problem' in who) return who.problem;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('remove_mileage', { p_mileage_id: parsed.data.id });
  if (error) return err(parsePostgresError(error).code);

  revalidateBooks();
  return ok(null);
}

/**
 * MNY-02: whether this Business charges VAT, and its number if it does.
 *
 * Asked rather than assumed: an empty number could mean "not registered" or "not filled in yet",
 * and the figures are different depending which.
 */
export async function setVatRegistration(input: unknown): Promise<Result<{ registered: boolean }>> {
  const refused = await refuseWhileViewing();
  if (refused) return refused;
  const parsed = vatInputSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  const access = await booksAccess();
  if (!access) return err('NOT_ALLOWED');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('set_vat_registration', {
    p_business_id: access.businessId,
    p_registered: parsed.data.registered,
    p_number: parsed.data.registered ? parsed.data.number : undefined,
  });
  if (error) {
    const problem = parsePostgresError(error);
    if (problem.code === 'VALIDATION_FAILED') {
      return err('VALIDATION_FAILED', undefined, { number: 'That is not a UK VAT number' });
    }
    return err(problem.code);
  }

  revalidateBooks();
  revalidatePath('/app/instructor/money/setup');
  return ok({ registered: parsed.data.registered });
}
