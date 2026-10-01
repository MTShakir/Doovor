'use server';

import { parsePostgresError } from '@repo/core/errors';
import { err, ok, type Result } from '@repo/core/result';
import { setProRenewalSchema, startProCheckoutSchema } from '@repo/core/schemas/subscription';
import { bankedMonthsCreditPence, subscriptionPricePence } from '@repo/core/subscription';
import { revalidatePath } from 'next/cache';
import { requirePortal } from '@/lib/auth/session';
import { refuseWhileViewing } from '@/lib/auth/view-as';
import { billingProvider } from '@/lib/billing/provider';
import { deliverFakeSubscriptionEvent } from '@/lib/billing/webhook';
import { proSubscription } from '@/lib/billing/subscription';
import { getAppUrl } from '@/lib/app-url';
import { fieldErrors } from '@/lib/forms';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

/**
 * Subscribing to Pro, and stopping (9.18, D-231, D-236).
 *
 * **Nothing here takes a price from the browser.** The only thing that arrives is the word
 * 'month' or 'year'. What that costs is worked out from `plans.ts` and from the run of months the
 * database has recorded; what comes off it is worked out from the referrals table. Neither number
 * is sent to the client before Stripe shows it, and neither would be believed if it were.
 *
 * **And nothing here grants Pro.** Starting a checkout writes an `incomplete` row and sends
 * somebody to Stripe's page. The plan changes when a signed webhook event says it has, so coming
 * back to the success page with a forged URL gets a page that says we are still waiting.
 */
export async function startProCheckout(input: unknown): Promise<Result<{ url: string }>> {
  const refused = await refuseWhileViewing();
  if (refused) return refused;

  const parsed = startProCheckoutSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));
  const { interval } = parsed.data;

  await requirePortal('instructor');
  const mine = await proSubscription();
  if (!mine) {
    return err('NOT_ALLOWED', 'Pro is for an independent instructor. A school pays per instructor.');
  }
  if (mine.live) {
    return err('ALREADY_RECORDED', 'You are already on Pro.');
  }

  // The amount, decided here. `monthsPaid` comes off the row, which only a signed event writes.
  const unitAmountPence = subscriptionPricePence({ interval, monthsPaidInARow: mine.monthsPaid });
  const creditPence = bankedMonthsCreditPence(mine.bankedMonths);

  const billing = billingProvider();
  const customer = await billing.ensureCustomer({
    businessId: mine.businessId,
    email: mine.payerEmail,
    name: mine.businessName,
  });
  if (!customer.ok) return err('UNKNOWN', couldNot);

  // A row to attach the webhook's answer to. `incomplete` carries no Pro, so this grants nothing.
  const { error } = await getSupabaseServiceClient().rpc('system_start_subscription', {
    p_business_id: mine.businessId,
    p_customer_id: customer.data.customerId,
    p_interval: interval,
  });
  if (error) return err(parsePostgresError(error).code);

  const back = `${getAppUrl()}/app/instructor/plan`;
  const started = await billing.startCheckout({
    customerId: customer.data.customerId,
    interval,
    unitAmountPence,
    creditPence,
    successUrl: `${back}?subscribed=1`,
    cancelUrl: back,
    businessId: mine.businessId,
  });
  if (!started.ok) return err('UNKNOWN', couldNot);

  revalidatePath('/app/instructor/plan');
  return ok({ url: started.data.url });
}

/**
 * Stopping at the end of the period, or changing your mind (9.18, CAN-06).
 *
 * Stopping never takes the plan away early: what has been paid for runs out first, and the
 * webhook that follows the period end is what moves the Business back to Free.
 */
export async function setProRenewal(input: unknown): Promise<Result<{ cancelAtPeriodEnd: boolean }>> {
  const refused = await refuseWhileViewing();
  if (refused) return refused;

  const parsed = setProRenewalSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  await requirePortal('instructor');
  const mine = await proSubscription();
  if (!mine) return err('NOT_ALLOWED', 'Pro is for an independent instructor.');

  const supabase = await createSupabaseServerClient();
  const { data: row } = await supabase
    .from('subscriptions')
    .select('stripe_subscription_id')
    .eq('business_id', mine.businessId)
    .maybeSingle();
  const subscriptionId = row?.stripe_subscription_id ?? null;
  if (subscriptionId === null) return err('NOT_FOUND', 'There is no subscription to change.');

  const answer = await billingProvider().setCancelAtPeriodEnd({ subscriptionId, cancel: parsed.data.cancel });
  if (!answer.ok) return err('UNKNOWN', couldNot);

  // The row follows from the event, not from here: this asked Stripe, and Stripe says what is
  // true. With the fake nobody sends that event, so it is sent here, through the same handler.
  await deliverFakeSubscriptionEvent(answer.data, 'customer.subscription.updated');

  revalidatePath('/app/instructor/plan');
  return ok({ cancelAtPeriodEnd: parsed.data.cancel });
}

const couldNot = 'We could not reach the card service. Try again in a minute.';
