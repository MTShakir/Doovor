import 'server-only';
import { getAppUrl } from '@/lib/app-url';
import { requireAccess } from '@/lib/auth/session';
import { paymentsProvider } from '@/lib/payments/provider';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface PaymentsState {
  businessId: string;
  businessName: string;
  /** Whether the person looking may connect or change it (owners only). */
  canManage: boolean;
  accountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  /** What the provider is still waiting for, in its own words (PAY-01). */
  requirements: string[];
  /** True when the provider could not be reached, so the page says so rather than guessing. */
  stale: boolean;
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
    .select('id, name, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_details_submitted')
    .eq('id', membership.businessId)
    .maybeSingle();
  if (!data) return null;

  const state: PaymentsState = {
    businessId: data.id,
    businessName: data.name,
    canManage: membership.role === 'owner',
    accountId: data.stripe_account_id,
    chargesEnabled: data.stripe_charges_enabled,
    payoutsEnabled: data.stripe_payouts_enabled,
    detailsSubmitted: data.stripe_details_submitted,
    requirements: [],
    stale: false,
  };
  if (state.accountId === null) return state;

  const live = await paymentsProvider().getAccount(state.accountId);
  if (!live.ok) return { ...state, stale: true };

  const changed =
    live.data.chargesEnabled !== state.chargesEnabled ||
    live.data.payoutsEnabled !== state.payoutsEnabled ||
    live.data.detailsSubmitted !== state.detailsSubmitted;
  if (changed && state.canManage) {
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
    payoutsEnabled: live.data.payoutsEnabled,
    detailsSubmitted: live.data.detailsSubmitted,
    requirements: live.data.requirements,
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
