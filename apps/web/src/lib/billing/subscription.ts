import 'server-only';
import { formatPence } from '@repo/core/money';
import {
  billingIntervals,
  isBillingInterval,
  monthsCovered,
  proListPricePence,
  renewalNoticeDays,
  subscriptionCarriesPro,
  subscriptionDiscountPercent,
  subscriptionPricePence,
  subscriptionWords,
  type BillingInterval,
  type SubscriptionStatus,
} from '@repo/core/subscription';
import { formatDateWithYear } from '@repo/core/time';
import { requireAccess } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** One of the two choices on the plan screen, priced. */
export interface ProOffer {
  interval: BillingInterval;
  /** "Monthly" or "Yearly". */
  label: string;
  /** What it costs now, after the loyalty discount: "£12" or "£10.80". */
  price: string;
  /** The list price, shown struck through only when something has come off it. */
  wasPrice: string | null;
  /** What a month works out at on this interval, so the two can be compared: "£10". */
  perMonth: string;
  /** Whole percent off, or nought. */
  discountPercent: number;
  /** "Save £24 a year" on the yearly choice, so the two can be weighed without arithmetic. */
  saving: string | null;
}

export interface ProSubscription {
  businessId: string;
  businessName: string;
  /** Who the invoice goes to: the signed-in owner, which is who is paying. */
  payerEmail: string;
  /** 'none' until a checkout has been started at least once. */
  status: SubscriptionStatus | 'none';
  /** Whether this Business has Pro through a subscription right now. */
  live: boolean;
  interval: BillingInterval | null;
  /** "Pro renews every month, next on Thu 24 Dec 2026." */
  words: string | null;
  cancelAtPeriodEnd: boolean;
  renewsOn: string | null;
  /** Months paid in a row, which is what moves the discount along (D-206). */
  monthsPaid: number;
  /** Months earned by referring people and not yet spent (D-205). */
  bankedMonths: number;
  /** What those months are worth off the next invoice: "£24", or null when there are none. */
  bankedWorth: string | null;
  /** Both choices, priced for this Business. */
  offers: ProOffer[];
  /** How many days of warning each interval gets, for the sentence that says so. */
  noticeDays: Record<BillingInterval, number>;
}

const labels: Record<BillingInterval, string> = { month: 'Monthly', year: 'Yearly' };

/**
 * What the plan screen needs to offer Pro (9.18, D-231).
 *
 * Every number here is worked out on the server: the price from `plans.ts`, the discount from the
 * run of months the database keeps, the banked months from the referrals table. The screen renders
 * them and sends back one word, which is why there is nothing here a browser could tamper with to
 * change what it is charged.
 *
 * Null for anybody who does not own an independent Business: a school pays per instructor on the
 * School plan, which is Phase 2 (D-231), and a manager never sees what the Business pays (PRD 6.2).
 */
export async function proSubscription(): Promise<ProSubscription | null> {
  const { access, session } = await requireAccess();
  const membership = access.memberships.find((one) => one.role === 'owner');
  if (!membership) return null;

  const supabase = await createSupabaseServerClient();
  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, type')
    .eq('id', membership.businessId)
    .maybeSingle();
  // Pro is for an independent instructor. A school pays per instructor on the School plan (D-231).
  if (business?.type !== 'independent') return null;

  const { data } = await supabase.rpc('my_subscription', { p_business_id: business.id });
  const row = readRow(data);

  const monthsPaid = row.monthsPaid;
  const offers = billingIntervals.map((interval) => {
    const list = proListPricePence(interval);
    const now = subscriptionPricePence({ interval, monthsPaidInARow: monthsPaid });
    const discountPercent = subscriptionDiscountPercent(monthsPaid);
    // What a year saves against paying for the same twelve months one at a time. Worked out from
    // the list prices, so a loyalty discount does not make it look like a bigger saving than it is.
    const savedPence = interval === 'year' ? proListPricePence('month') * 12 - list : 0;
    return {
      interval,
      label: labels[interval],
      price: formatPence(now),
      wasPrice: now === list ? null : formatPence(list),
      perMonth: formatPence(Math.round(now / monthsCovered(interval))),
      discountPercent,
      saving: savedPence > 0 ? `Save ${formatPence(savedPence)} a year` : null,
    };
  });

  const renewsAt = row.currentPeriodEnd;
  const live = row.status !== 'none' && subscriptionCarriesPro(row.status);

  return {
    businessId: business.id,
    businessName: business.name,
    payerEmail: session.email ?? '',
    status: row.status,
    live,
    interval: row.interval,
    words:
      row.status === 'none' || row.interval === null
        ? null
        : subscriptionWords({
            status: row.status,
            interval: row.interval,
            renewsAt,
            cancelAtPeriodEnd: row.cancelAtPeriodEnd,
            formatDate: formatDateWithYear,
          }),
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    renewsOn: renewsAt === null ? null : formatDateWithYear(renewsAt),
    monthsPaid,
    bankedMonths: row.bankedMonths,
    bankedWorth: row.bankedMonths > 0 ? formatPence(row.bankedMonths * proListPricePence('month')) : null,
    offers,
    noticeDays: renewalNoticeDays,
  };
}

const statuses = new Set<string>(['incomplete', 'trialing', 'active', 'past_due', 'canceled', 'unpaid']);

/** `my_subscription` answers with jsonb, so every field is read rather than trusted. */
function readRow(data: unknown): {
  status: SubscriptionStatus | 'none';
  interval: BillingInterval | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  monthsPaid: number;
  bankedMonths: number;
} {
  const row = data !== null && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const status = typeof row.status === 'string' && statuses.has(row.status) ? (row.status as SubscriptionStatus) : 'none';
  const end = typeof row.currentPeriodEnd === 'string' ? new Date(row.currentPeriodEnd) : null;
  return {
    status,
    interval: isBillingInterval(row.billingInterval) ? row.billingInterval : null,
    currentPeriodEnd: end !== null && !Number.isNaN(end.getTime()) ? end : null,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd === true,
    monthsPaid: typeof row.monthsPaid === 'number' && row.monthsPaid > 0 ? Math.floor(row.monthsPaid) : 0,
    bankedMonths: typeof row.bankedMonths === 'number' && row.bankedMonths > 0 ? Math.floor(row.bankedMonths) : 0,
  };
}
