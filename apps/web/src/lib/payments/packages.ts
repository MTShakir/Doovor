import 'server-only';
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

export interface PackageForSale {
  id: string;
  name: string;
  minutes: number;
  pricePence: number;
}

/**
 * What a Business sells, for somebody who works there recording a package paid for in person
 * (PAY-05, M3-16). Smallest first.
 */
export async function packagesForSale(businessId: string): Promise<PackageForSale[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('packages')
    .select('id, name, minutes, price_pence')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .gt('price_pence', 0)
    .order('minutes', { ascending: true });
  return (data ?? []).map((row) => ({ id: row.id, name: row.name, minutes: row.minutes, pricePence: row.price_pence }));
}

export interface LearnerBusiness {
  businessId: string;
  businessName: string;
  /** The Business can take a card, so what is owed can be paid on screen. */
  takesCards: boolean;
  /** What it sells that can be bought by card now, smallest first. */
  packages: PackageOffer[];
}

/** Every Business the learner learns with, whether it takes cards, and the packages it sells. */
export async function learnerBusinesses(learnerId: string): Promise<LearnerBusiness[]> {
  const supabase = await createSupabaseServerClient();
  const [relationships, packages] = await Promise.all([
    supabase
      .from('learner_relationships')
      .select('business_id, businesses!learner_relationships_business_id_fkey(name, stripe_account_id, stripe_charges_enabled)')
      .eq('learner_id', learnerId),
    supabase.from('packages').select(offerColumns).eq('is_active', true).order('minutes', { ascending: true }),
  ]);

  const offers = (packages.data ?? []).map(offerFrom).filter((offer) => offer.accountId !== null);
  return (relationships.data ?? [])
    .map((row) => ({
      businessId: row.business_id,
      businessName: row.businesses.name,
      takesCards: row.businesses.stripe_charges_enabled && row.businesses.stripe_account_id !== null,
      packages: offers.filter((offer) => offer.businessId === row.business_id),
    }))
    .sort((a, b) => a.businessName.localeCompare(b.businessName));
}
