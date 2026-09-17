import 'server-only';
import { priceRows, type PriceRow } from '@repo/core/catalogue';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface PackageView {
  packageId: string;
  name: string;
  minutes: number;
  pricePence: number;
  /** Days to use the hours in; null when they never run out. */
  expiryDays: number | null;
  onSale: boolean;
}

export interface CatalogueView {
  rows: PriceRow[];
  packages: PackageView[];
}

/**
 * A Business's prices and packages, with one instructor's own prices beside the Business's when
 * an instructor is named (R-05, PAY-04, SCH-04). Read as the person asking, under row-level
 * security. Throws when it cannot be read, rather than showing a Business that sells nothing.
 */
export async function businessCatalogue(businessId: string, instructorId: string | null = null): Promise<CatalogueView> {
  const supabase = await createSupabaseServerClient();
  const [types, prices, packages] = await Promise.all([
    supabase.from('lesson_types').select('id, name').eq('business_id', businessId).eq('is_active', true).order('sort_order').order('name'),
    supabase.from('lesson_prices').select('lesson_type_id, duration_minutes, price_pence, instructor_id').eq('business_id', businessId),
    supabase
      .from('packages')
      .select('id, name, minutes, price_pence, expiry_days, is_active')
      .eq('business_id', businessId)
      .order('is_active', { ascending: false })
      .order('minutes'),
  ]);
  const failed = types.error ?? prices.error ?? packages.error;
  if (failed) throw new Error(`Could not read the prices and packages: ${failed.message}`);

  return {
    rows: priceRows(
      types.data ?? [],
      (prices.data ?? []).map((one) => ({
        lessonTypeId: one.lesson_type_id,
        durationMinutes: one.duration_minutes,
        pricePence: one.price_pence,
        instructorId: one.instructor_id,
      })),
      instructorId,
    ),
    packages: (packages.data ?? []).map((one) => ({
      packageId: one.id,
      name: one.name,
      minutes: one.minutes,
      pricePence: one.price_pence,
      expiryDays: one.expiry_days,
      onSale: one.is_active,
    })),
  };
}
