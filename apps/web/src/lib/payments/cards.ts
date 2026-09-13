import 'server-only';
import { usableCards } from '@repo/core/cards';
import type { SavedCard } from '@repo/providers/payments';
import { paymentsProvider } from '@/lib/payments/provider';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * The cards a learner has kept with a Business (PAY-02, M3-07).
 *
 * Nothing about a card is stored here: the provider keeps them, on the Business's own account,
 * against the customer that `billing_customers` says is this learner. So the list is always
 * the provider's, and a card removed anywhere is gone everywhere.
 */

export interface KeptCards {
  businessId: string;
  businessName: string;
  accountId: string;
  customerId: string;
  /** Only cards that still work, newest first. */
  cards: SavedCard[];
}

/**
 * Whose cards these are is decided by row-level security, never by the caller: the only
 * `billing_customers` rows a learner can read are their own.
 */
async function customersOf(businessId?: string) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('billing_customers')
    .select('business_id, provider_customer_id, businesses!billing_customers_business_id_fkey(name, stripe_account_id)')
    .order('created_at', { ascending: true });
  if (businessId !== undefined) query = query.eq('business_id', businessId);
  const { data } = await query;
  return data ?? [];
}

type CustomerRow = Awaited<ReturnType<typeof customersOf>>[number];

async function withCards(row: CustomerRow, now: Date): Promise<KeptCards | null> {
  const accountId = row.businesses.stripe_account_id;
  if (accountId === null) return null;

  const listed = await paymentsProvider().listSavedCards({ accountId, customerId: row.provider_customer_id });
  return {
    businessId: row.business_id,
    businessName: row.businesses.name,
    accountId,
    customerId: row.provider_customer_id,
    // A provider that cannot be reached shows no cards, rather than no page.
    cards: listed.ok ? usableCards(listed.data, now) : [],
  };
}

/** Every Business the learner has paid by card, with the cards they kept there. */
export async function keptCardsByBusiness(now = new Date()): Promise<KeptCards[]> {
  const rows = await customersOf();
  const kept = await Promise.all(rows.map((row) => withCards(row, now)));
  return kept.filter((one): one is KeptCards => one !== null);
}

/** The cards kept with one Business, for paying it. */
export async function keptCardsWith(businessId: string, now = new Date()): Promise<KeptCards | null> {
  const [row] = await customersOf(businessId);
  return row ? withCards(row, now) : null;
}
