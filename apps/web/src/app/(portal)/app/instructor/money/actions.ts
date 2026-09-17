'use server';

import { parsePostgresError } from '@repo/core/errors';
import { paymentModes, type PaymentMode } from '@repo/core/payment-modes';
import { err, ok, type Result } from '@repo/core/result';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getAppUrl } from '@/lib/app-url';
import { requireAccess } from '@/lib/auth/session';
import { connectUrls, moneyScreens, type MoneyScreen } from '@/lib/payments/connect';
import { paymentsProvider } from '@/lib/payments/provider';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { refuseWhileViewing } from '@/lib/auth/view-as';

/** Where the person is, so the provider sends them back there and nowhere else. */
const screenSchema = z.object({
  screen: z.enum(Object.keys(moneyScreens) as [MoneyScreen, ...MoneyScreen[]]),
});

/** The Business this person owns, which is the only one they may connect payments for. */
async function ownedBusiness(): Promise<{ id: string; name: string; accountId: string | null } | null> {
  const { access } = await requireAccess();
  const membership = access.memberships.find((one) => one.role === 'owner');
  if (!membership) return null;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('businesses')
    .select('id, name, stripe_account_id')
    .eq('id', membership.businessId)
    .maybeSingle();
  return data ? { id: data.id, name: data.name, accountId: data.stripe_account_id } : null;
}

/**
 * PAY-01: connect this Business to its own payments account, and send them off to finish it.
 *
 * The account is made at the provider, written down here, and then a link is made to their
 * onboarding. Coming back is `/app/instructor/money`, which reads the account again: the
 * webhook says the same thing a moment later, and neither depends on the other.
 */
export async function connectPayments(input: unknown): Promise<Result<{ url: string }>> {
  const refused = await refuseWhileViewing();
  if (refused) return refused;
  const screen = screenSchema.safeParse(input);
  if (!screen.success) return err('VALIDATION_FAILED');

  const business = await ownedBusiness();
  if (!business) return err('NOT_ALLOWED');

  const provider = paymentsProvider();
  const supabase = await createSupabaseServerClient();

  let accountId = business.accountId;
  if (accountId === null) {
    const made = await provider.createAccount({ businessName: business.name });
    if (!made.ok) return err('UNKNOWN', 'We could not set up payments just now. Try again.');
    accountId = made.data.accountId;

    const written = await supabase.rpc('set_payments_account', {
      p_business_id: business.id,
      p_account_id: accountId,
    });
    if (written.error) return err(parsePostgresError(written.error).code);

    // Wallets only appear on a site the account has claimed (PAY-02). A failure here is not
    // worth stopping for: cards still work, and the next connect tries again.
    await provider.registerPaymentDomain({ accountId, domain: new URL(getAppUrl()).host });
  }

  const link = await provider.createAccountLink({ accountId, ...connectUrls(screen.data.screen) });
  if (!link.ok) return err('UNKNOWN', 'We could not open the setup page. Try again.');

  revalidatePath('/app/instructor/money');
  revalidatePath('/app/school/money');
  return ok({ url: link.data.url });
}

/** PAY-01: ask the provider again, for somebody who finished on another device. */
export async function refreshPaymentsState(): Promise<Result<{ chargesEnabled: boolean }>> {
  const refused = await refuseWhileViewing();
  if (refused) return refused;
  const business = await ownedBusiness();
  if (!business?.accountId) return err('NOT_FOUND');

  const live = await paymentsProvider().getAccount(business.accountId);
  if (!live.ok) return err('UNKNOWN', 'We could not reach the payments service. Try again.');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('set_payments_state', {
    p_business_id: business.id,
    p_charges_enabled: live.data.chargesEnabled,
    p_payouts_enabled: live.data.payoutsEnabled,
    p_details_submitted: live.data.detailsSubmitted,
  });
  if (error) return err(parsePostgresError(error).code);

  revalidatePath('/app/instructor/money');
  revalidatePath('/app/school/money');
  return ok({ chargesEnabled: live.data.chargesEnabled });
}

const modeSchema = z.object({ mode: z.enum(paymentModes) });

/**
 * PAY-03: how learners pay this Business. Owners only, which the database checks as well, and
 * it applies to lessons booked from now on.
 */
export async function setPaymentMode(input: unknown): Promise<Result<{ mode: PaymentMode }>> {
  const parsed = modeSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');

  const business = await ownedBusiness();
  if (!business) return err('NOT_ALLOWED', 'Only the owner of the business can choose how learners pay.');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('set_payment_mode', { p_business_id: business.id, p_mode: parsed.data.mode });
  if (error) return err(parsePostgresError(error).code);

  for (const path of Object.values(moneyScreens)) revalidatePath(path);
  return ok({ mode: parsed.data.mode });
}
