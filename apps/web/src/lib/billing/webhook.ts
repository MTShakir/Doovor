import 'server-only';
import {
  isBillingInterval,
  monthsFromCreditPence,
  subscriptionPricePence,
} from '@repo/core/subscription';
import type { BillingWebhookEvent, Subscription } from '@repo/providers/billing';
import { billingProvider, billingWebhookSecrets, signFakeBillingEvent } from '@/lib/billing/provider';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

export interface BillingWebhookAnswer {
  status: number;
  body: unknown;
}

/**
 * What happens to an event from Stripe Billing (9.18, D-231, D-235).
 *
 * Its own path, not the Connect one. Those events are on a connected account and are about a
 * learner paying a Business; these are on our own account and are about a Business paying us,
 * which means a different endpoint, a different signing secret and different functions.
 *
 * **This is the only thing that grants Pro.** A browser coming back from Stripe grants nothing:
 * the success page it lands on reads whatever this has written, and says "we are still waiting"
 * if that is nothing yet. So forging the redirect gets somebody a page and not a plan.
 *
 * Kept apart from the route so the same path can be walked without HTTP, which is how the local
 * fake exercises it.
 */
export async function handleBillingEvent(input: {
  body: string;
  signature: string;
}): Promise<BillingWebhookAnswer> {
  const secrets = billingWebhookSecrets();
  if (secrets.length === 0) {
    // Nothing to check a signature against means anything could be accepted, so nothing is.
    return { status: 503, body: { error: 'Subscription webhooks are not configured' } };
  }

  const provider = billingProvider();
  let event: BillingWebhookEvent | null = null;
  for (const secret of secrets) {
    const checked = await provider.verifyWebhook({ body: input.body, signature: input.signature, secret });
    if (checked.ok) {
      event = checked.data;
      break;
    }
  }
  if (event === null) {
    return { status: 400, body: { error: 'Bad signature' } };
  }

  const { data, error } = await getSupabaseServiceClient().rpc('system_process_billing_event', {
    p_event_id: event.id,
    p_event_type: event.type,
    p_payload: payloadFor(event) as never,
  });

  if (error) {
    // Nothing was recorded and nothing was applied, so Stripe will send it again.
    return { status: 500, body: { error: 'Could not process the event' } };
  }

  await moveTheDiscountAlong(data);
  await undoADuplicate(data);

  return { status: 200, body: data };
}

/**
 * Gives back a second subscription that should never have existed (D-239).
 *
 * Two tabs can both finish a checkout in the seconds before the first event lands. The database
 * recognises the second and refuses to record it, which leaves it live at Stripe and billing a
 * card every month for a plan the Business already has. So it is ended now and refunded, and what
 * came back is written to the audit trail.
 *
 * Nothing here may fail the webhook. The event is recorded either way, and answering anything but
 * 200 would have Stripe send it again and ask for a second refund. A refund that could not be
 * made leaves an audit row saying it was asked for and not that it happened, which is what
 * somebody looking into it needs to see.
 */
async function undoADuplicate(answer: unknown): Promise<void> {
  if (answer === null || typeof answer !== 'object') return;
  const row = answer as Record<string, unknown>;
  if (row.outcome !== 'duplicate_subscription') return;

  const subscriptionId = typeof row.duplicateSubscriptionId === 'string' ? row.duplicateSubscriptionId : null;
  const customerId = typeof row.customerId === 'string' ? row.customerId : null;
  const businessId = typeof row.businessId === 'string' ? row.businessId : null;
  if (subscriptionId === null || customerId === null || businessId === null) return;

  try {
    const undone = await billingProvider().cancelAndRefund({ subscriptionId, customerId });
    if (!undone.ok) return;
    await getSupabaseServiceClient().rpc('system_record_subscription_refund', {
      p_business_id: businessId,
      p_duplicate_subscription_id: subscriptionId,
      p_refunded_pence: undone.data.refundedPence,
      p_credit_restored_pence: undone.data.creditRestoredPence,
    });
  } catch {
    // Asked and not answered. The audit row already says a refund was asked for.
  }
}

/**
 * Tells Stripe the next period costs less, when another three months of paying have earned it
 * (D-206, D-238).
 *
 * A subscription keeps charging whatever it was created with until something changes it. Without
 * this, somebody who subscribed in their first month would pay full price for ever, and the
 * promise on the plan screen would be true of a new subscription and of nothing else.
 *
 * The answer carries the run of months before this invoice and after it, so what the price was
 * and what it becomes are both worked out here, from `plans.ts`, and Stripe is only asked when
 * they differ. Nothing is prorated: a discount is a reduction in a price, not a transaction.
 *
 * Nothing here may fail the webhook. The payment is recorded and the plan is granted; a price
 * that could not be moved is a price that moves on the next invoice instead, and answering
 * anything but 200 would have Stripe send the whole event again.
 */
async function moveTheDiscountAlong(answer: unknown): Promise<void> {
  if (answer === null || typeof answer !== 'object') return;
  const row = answer as Record<string, unknown>;
  if (row.outcome !== 'payment_recorded') return;

  const subscriptionId = typeof row.subscriptionId === 'string' ? row.subscriptionId : null;
  const before = typeof row.monthsBefore === 'number' ? row.monthsBefore : null;
  const after = typeof row.monthsAfter === 'number' ? row.monthsAfter : null;
  if (subscriptionId === null || before === null || after === null || !isBillingInterval(row.interval)) return;

  const was = subscriptionPricePence({ interval: row.interval, monthsPaidInARow: before });
  const now = subscriptionPricePence({ interval: row.interval, monthsPaidInARow: after });
  if (was === now) return;

  try {
    await billingProvider().setSubscriptionPrice({ subscriptionId, unitAmountPence: now });
  } catch {
    // Asked and not answered. The payment stands; the price moves on the next invoice.
  }
}

/**
 * The event in the shape the database reads.
 *
 * Only what the function uses, and nothing it should not trust. How many months the money covers
 * is deliberately absent: that follows from the interval on the row, which only a signed event
 * ever wrote, so it is not something this can get wrong or be made to get wrong.
 */
function payloadFor(event: BillingWebhookEvent): Record<string, unknown> {
  if (event.subscription !== null) {
    const subscription = event.subscription;
    return {
      kind: 'subscription',
      subscriptionId: subscription.id,
      customerId: subscription.customerId,
      // A deleted subscription is a cancelled one, whatever status it carried on the way out.
      status: event.type === 'customer.subscription.deleted' ? 'canceled' : subscription.status,
      interval: subscription.interval,
      periodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    };
  }

  if (event.invoice !== null) {
    const invoice = event.invoice;
    return {
      kind: 'invoice',
      subscriptionId: invoice.subscriptionId,
      paidPence: invoice.paidPence,
      paidAt: invoice.paidAt.toISOString(),
      // Whole months only: a part month of credit spends no referral month (D-205).
      monthsCredited: monthsFromCreditPence(invoice.creditAppliedPence),
    };
  }

  // Recorded and ignored. It still goes to the database, so a second delivery of it is a
  // duplicate rather than something that gets looked at again.
  return { kind: 'other' };
}

/**
 * Stands in for Stripe telling us a subscription changed, while the fake is in use (D-231).
 *
 * With Stripe, asking for a subscription to stop renewing is answered by an event a moment
 * later, and that event is what moves the row. The fake has nobody to send one, so the caller
 * sends it here, through the same handler: same signature check, same exactly-once record, same
 * function writing the row. Without this the local flow would change Stripe's mind and not ours,
 * which is the one bug this arrangement is meant to make impossible to miss.
 *
 * Answers false with Stripe, where there is nothing to stand in for.
 */
export async function deliverFakeSubscriptionEvent(subscription: Subscription, type: string): Promise<boolean> {
  const signature = signFakeBillingEvent();
  if (signature === null) return false;

  const body = JSON.stringify({
    // What changed is part of the id, so stopping and then changing your mind are two events
    // rather than the second being thrown away as a duplicate of the first.
    id: `evt_sub_${subscription.id}_${String(subscription.cancelAtPeriodEnd)}_${subscription.status}`,
    type,
    subscription,
    invoice: null,
  });

  const answer = await handleBillingEvent({ body, signature });
  return answer.status === 200;
}
