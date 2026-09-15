'use server';

import { err, ok, type Result } from '@repo/core/result';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePortal } from '@/lib/auth/session';
import { keptCardsWith } from '@/lib/payments/cards';
import { paymentsProvider } from '@/lib/payments/provider';

const forgetSchema = z.object({
  businessId: z.uuid(),
  paymentMethodId: z.string().min(3).max(100),
});

/**
 * Removes a card a learner kept with a Business (PAY-02, M3-07).
 *
 * Which customer the card is taken from comes from the learner's own `billing_customers` row,
 * read under row-level security, and the provider refuses a card that is not on that customer.
 * So a learner can only ever remove their own card, whatever the browser sends.
 */
export async function forgetCard(input: unknown): Promise<Result<null>> {
  const parsed = forgetSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');

  await requirePortal('learner');
  const kept = await keptCardsWith(parsed.data.businessId);
  if (!kept) return err('NOT_FOUND', 'That card is not saved any more.');

  const forgotten = await paymentsProvider().forgetSavedCard({
    accountId: kept.accountId,
    customerId: kept.customerId,
    paymentMethodId: parsed.data.paymentMethodId,
  });
  if (!forgotten.ok) {
    return forgotten.reason === 'NOT_FOUND'
      ? err('NOT_FOUND', 'That card is not saved any more.')
      : err('UNKNOWN', 'We could not remove that card. Try again.');
  }

  revalidatePath('/app/learner/payments');
  return ok(null);
}
