'use server';

import { parsePostgresError } from '@repo/core/errors';
import { err, ok, type Result } from '@repo/core/result';
import { receiptDetailsSchema } from '@repo/core/schemas/receipt-details';
import { revalidatePath } from 'next/cache';
import { requireAccess } from '@/lib/auth/session';
import { fieldErrors } from '@/lib/forms';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * PAY-08, M3-20: the address and VAT number that go on this Business's receipts. Only its owner
 * sets them, and row-level security checks the same thing again. Receipts already issued keep what
 * they said.
 */
export async function saveReceiptDetails(input: unknown): Promise<Result<{ vatRegistered: boolean }>> {
  const parsed = receiptDetailsSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', 'Check the details below.', fieldErrors(parsed.error));

  const { access } = await requireAccess();
  const membership = access.memberships.find((one) => one.role === 'owner');
  if (!membership) return err('NOT_ALLOWED', 'Only the owner of the business can change what goes on its receipts.');

  const { line1, line2, town, postcode, vatNumber } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('businesses')
    .update({ address: { line1, line2: line2 === '' ? null : line2, town, postcode }, vat_number: vatNumber })
    .eq('id', membership.businessId)
    .select('id');
  if (error) return err(parsePostgresError(error).code);
  if (data.length === 0) return err('NOT_ALLOWED', 'Only the owner of the business can change what goes on its receipts.');

  revalidatePath('/app/instructor/money');
  revalidatePath('/app/school/money');
  return ok({ vatRegistered: vatNumber !== null });
}
