import 'server-only';
import { balanceMinutes, type CreditLot } from '@repo/core/credit';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Packages a learner can buy, and the credit they already have (PAY-04, PAY-06, M3-13).
 *
 * Read under row-level security as the learner: the packages they see are those of Businesses
 * they learn with, and the credit is their own.
 */

export interface PackageOffer {
  packageId: string;
  businessId: string;
  businessName: string;
  /** The account a card payment goes to. Null while the Business cannot take cards. */
  accountId: string | null;
  name: string;
  minutes: number;
  pricePence: number;
  /** Days to use the hours in. Null when they never run out. */
  expiryDays: number | null;
  /** Still sold. A package taken off sale can still be looked at, not bought. */
  onSale: boolean;
}

const offerColumns =
  'id, business_id, name, minutes, price_pence, expiry_days, is_active, businesses!packages_business_id_fkey(name, stripe_account_id, stripe_charges_enabled)';

interface OfferRow {
  id: string;
  business_id: string;
  name: string;
  minutes: number;
  price_pence: number;
  expiry_days: number | null;
  is_active: boolean;
  businesses: { name: string; stripe_account_id: string | null; stripe_charges_enabled: boolean };
}

function offerFrom(row: OfferRow): PackageOffer {
  return {
    packageId: row.id,
    businessId: row.business_id,
    businessName: row.businesses.name,
    accountId: row.businesses.stripe_charges_enabled ? row.businesses.stripe_account_id : null,
    name: row.name,
    minutes: row.minutes,
    pricePence: row.price_pence,
    expiryDays: row.expiry_days,
    onSale: row.is_active,
  };
}

/** One package, for the screen that buys it. Null for a package this learner cannot see. */
export async function packageOffer(packageId: string): Promise<PackageOffer | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from('packages').select(offerColumns).eq('id', packageId).maybeSingle();
  return data ? offerFrom(data) : null;
}

export interface CreditWithBusiness {
  businessId: string;
  businessName: string;
  /** What can be booked with now: bought, not used and not run out (PAY-06). */
  balanceMinutes: number;
  /** What the Business sells, smallest first. Empty while it cannot take cards. */
  packages: PackageOffer[];
}

/**
 * The learner's credit with each Business they learn with, and what each one sells. A Business
 * that sells nothing, and with which they have no credit, has nothing to show and is left out.
 */
export async function creditWithBusinesses(learnerId: string, now = new Date()): Promise<CreditWithBusiness[]> {
  const supabase = await createSupabaseServerClient();
  const [relationships, packages, lots] = await Promise.all([
    supabase
      .from('learner_relationships')
      .select('business_id, businesses!learner_relationships_business_id_fkey(name)')
      .eq('learner_id', learnerId),
    supabase.from('packages').select(offerColumns).eq('is_active', true).order('minutes', { ascending: true }),
    supabase
      .from('credit_lots')
      .select('id, business_id, minutes_total, minutes_remaining, price_pence, purchased_at, expires_at')
      .eq('learner_id', learnerId),
  ]);

  const offers = (packages.data ?? []).map(offerFrom).filter((offer) => offer.accountId !== null);
  const lotsByBusiness = new Map<string, CreditLot[]>();
  for (const row of lots.data ?? []) {
    const lot: CreditLot = {
      id: row.id,
      minutesTotal: row.minutes_total,
      minutesRemaining: row.minutes_remaining,
      pricePence: row.price_pence,
      purchasedAt: new Date(row.purchased_at),
      expiresAt: row.expires_at === null ? null : new Date(row.expires_at),
    };
    lotsByBusiness.set(row.business_id, [...(lotsByBusiness.get(row.business_id) ?? []), lot]);
  }

  return (relationships.data ?? [])
    .map((row) => ({
      businessId: row.business_id,
      businessName: row.businesses.name,
      balanceMinutes: balanceMinutes(lotsByBusiness.get(row.business_id) ?? [], now),
      packages: offers.filter((offer) => offer.businessId === row.business_id),
    }))
    .filter((one) => one.balanceMinutes > 0 || one.packages.length > 0)
    .sort((a, b) => a.businessName.localeCompare(b.businessName));
}
