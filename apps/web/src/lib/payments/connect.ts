import 'server-only';
import { chosenPaymentMode, type PaymentMode } from '@repo/core/payment-modes';
import { getAppUrl } from '@/lib/app-url';
import { requireAccess } from '@/lib/auth/session';
import { paymentsProvider } from '@/lib/payments/provider';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface PaymentsAccount {
  accountId: string | null;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  /** What the provider is still waiting for, in its own words (PAY-01). */
  requirements: string[];
  /** True when the provider could not be reached, so the page says so rather than guessing. */
  stale: boolean;
}

export interface PaymentsState {
  businessId: string;
  businessName: string;
  /** Whether the person looking may connect or change it (owners only). */
  canManage: boolean;
  /** Whether learners can pay by card, which everybody at the Business may know. */
  chargesEnabled: boolean;
  /** How learners pay this Business, as the owner chose (PAY-03). */
  paymentMode: PaymentMode;
  /**
   * The account and its payouts. The owner's alone, so null for anybody else: a manager never sees
   * payouts or billing (PRD 6.2, acceptance test 11), and the provider is not asked on their behalf.
   */
  account: PaymentsAccount | null;
}

/** The two screens this can be done from, and nowhere else a link may point (PAY-01). */
export const moneyScreens = { instructor: '/app/instructor/money', school: '/app/school/money' } as const;

export type MoneyScreen = keyof typeof moneyScreens;

/**
 * Where the provider sends somebody when they finish, or when the link goes stale: back to
 * the screen they started from, and never anywhere a caller chose.
 */
export function connectUrls(screen: MoneyScreen): { returnUrl: string; refreshUrl: string } {
  const base = getAppUrl();
  const path = moneyScreens[screen];
  return { returnUrl: `${base}${path}?connected=1`, refreshUrl: `${base}${path}?again=1` };
}

/**
 * How this Business stands with its payments account (PAY-01, M3-02).
 *
 * The row is what the app reads; the provider is the truth. When a connected account is
 * present, the provider is asked as well and anything that has changed is written back, so a
 * Business that finished onboarding on a laptop sees it on their phone without a webhook.
 */
export async function paymentsState(): Promise<PaymentsState | null> {
  const { access } = await requireAccess();
  // The Business somebody owns comes first: that is the one they can do anything about.
  const membership =
    access.memberships.find((one) => one.role === 'owner') ??
    access.memberships.find((one) => one.instructorProfileId !== null) ??
    access.memberships[0];
  if (!membership) return null;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('businesses')
    .select('id, name, settings, stripe_charges_enabled')
    .eq('id', membership.businessId)
    .maybeSingle();
  if (!data) return null;

  const state: PaymentsState = {
    businessId: data.id,
    businessName: data.name,
    canManage: membership.role === 'owner',
    chargesEnabled: data.stripe_charges_enabled,
    paymentMode: chosenPaymentMode(data.settings),
    account: null,
  };
  if (!state.canManage) return state;

  const { data: row } = await supabase.rpc('payments_account', { p_business_id: data.id }).maybeSingle();
  if (!row) return state;
  const account: PaymentsAccount = {
    accountId: row.account_id,
    payoutsEnabled: row.payouts_enabled,
    detailsSubmitted: row.details_submitted,
    requirements: [],
    stale: false,
  };
  if (account.accountId === null) return { ...state, account };

  const live = await paymentsProvider().getAccount(account.accountId);
  if (!live.ok) return { ...state, account: { ...account, stale: true } };

  const changed =
    live.data.chargesEnabled !== state.chargesEnabled ||
    live.data.payoutsEnabled !== account.payoutsEnabled ||
    live.data.detailsSubmitted !== account.detailsSubmitted;
  if (changed) {
    await supabase.rpc('set_payments_state', {
      p_business_id: state.businessId,
      p_charges_enabled: live.data.chargesEnabled,
      p_payouts_enabled: live.data.payoutsEnabled,
      p_details_submitted: live.data.detailsSubmitted,
    });
  }

  return {
    ...state,
    chargesEnabled: live.data.chargesEnabled,
    account: {
      ...account,
      payoutsEnabled: live.data.payoutsEnabled,
      detailsSubmitted: live.data.detailsSubmitted,
      requirements: live.data.requirements,
    },
  };
}

/** What Stripe's requirement names mean to somebody who has never seen one (PAY-01). */
const inWords: Record<string, string> = {
  external_account: 'Where your payouts go',
  'individual.verification.document': 'Photo ID',
  'individual.id_number': 'Your National Insurance number',
  'company.verification.document': 'A document for the company',
  tos_acceptance: 'Accepting the payment terms',
  business_profile: 'What your business does',
};

export function requirementInWords(requirement: string): string {
  return inWords[requirement] ?? requirement.replaceAll('_', ' ').replaceAll('.', ': ');
}
