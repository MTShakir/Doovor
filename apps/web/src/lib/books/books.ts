import 'server-only';
import { summariseBooks, type BooksFacts, type BooksSummary } from '@repo/core/books';
import { isExpenseCategory, type ExpenseCategory } from '@repo/core/expenses';
import { taxYear, taxYearsUpTo, type TaxYear } from '@repo/core/tax-year';
import { vehicleName } from '@repo/core/vehicle';
import { todayInZone } from '@repo/core/time';
import { z } from '@repo/core/zod';
import { hasEntitlement, isPlanKey, type PlanKey } from '@repo/config/plans';
import { requireAccess } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const pence = z.number().int();

// The function answers JSON, so what comes back is read the way any input is.
const factsSchema = z.object({
  vat_registered: z.boolean().nullable(),
  payments: z.object({ total_pence: pence, card_pence: pence, count: pence }),
  refunds: z.object({ total_pence: pence, count: pence }),
  provider_fees: z.object({ total_pence: pence, unknown_count: pence }),
  expenses: z.array(
    z.object({ category: z.string(), total_pence: pence, vat_pence: pence, count: pence }),
  ),
  mileage: z.object({ tenths: pence, trips: pence }),
});

/**
 * Who is asking, and whether the books are theirs to keep (MNY-02, D-198).
 *
 * Solo instructors on Pro. A school is told it is coming; a Business on the free plan is told what
 * the plan includes. The database checks the first of those again, so neither is only a screen.
 */
export interface BooksAccess {
  businessId: string;
  businessName: string;
  /** False for a school, which sees "coming soon" instead (MNY-06 is Phase 2). */
  solo: boolean;
  /** False on the free plan, where the books are offered rather than opened. */
  included: boolean;
  plan: PlanKey;
  vatRegistered: boolean;
  vatNumber: string | null;
}

export async function booksAccess(): Promise<BooksAccess | null> {
  const { access } = await requireAccess();
  const membership = access.memberships.find((one) => one.role === 'owner');
  if (!membership) return null;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('businesses')
    .select('id, name, type, vat_registered, vat_number')
    .eq('id', membership.businessId)
    .maybeSingle();
  if (!data) return null;

  // The plan is the owner's to know, and is read through the function that checks that (D-123).
  const { data: billing } = await supabase.rpc('business_billing', { p_business_id: data.id }).maybeSingle();
  const plan: PlanKey = isPlanKey(billing?.plan) ? billing.plan : 'free';

  return {
    businessId: data.id,
    businessName: data.name,
    solo: data.type === 'independent',
    included: hasEntitlement(plan, 'expensesAndExports'),
    plan,
    vatRegistered: data.vat_registered,
    vatNumber: data.vat_number,
  };
}

/** The tax years the books offer, newest first. */
export function booksYears(now = new Date()): TaxYear[] {
  return taxYearsUpTo(todayInZone(now));
}

/** The year asked for, or the one we are in. */
export function booksYearFrom(value: string | string[] | undefined, now = new Date()): TaxYear {
  const years = booksYears(now);
  const asked = typeof value === 'string' ? Number(value) : Number.NaN;
  const found = years.find((one) => one.starts === asked);
  return found ?? years[0] ?? taxYear(todayInZone(now).slice(0, 4) as unknown as number);
}

/** A year's trading, as a return would ask for it. Null when it could not be read. */
export async function booksFor(businessId: string, year: TaxYear): Promise<BooksSummary | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('books_year', {
    p_business_id: businessId,
    p_from: year.from,
    p_to: year.to,
  });
  if (error) return null;

  const parsed = factsSchema.safeParse(data);
  if (!parsed.success) return null;
  const raw = parsed.data;

  const facts: BooksFacts = {
    vatRegistered: raw.vat_registered ?? false,
    payments: { totalPence: raw.payments.total_pence, cardPence: raw.payments.card_pence, count: raw.payments.count },
    refunds: { totalPence: raw.refunds.total_pence, count: raw.refunds.count },
    providerFees: { totalPence: raw.provider_fees.total_pence, unknownCount: raw.provider_fees.unknown_count },
    // A category the database knows and this build does not is left out rather than guessed at.
    expenses: raw.expenses
      .filter((one): one is typeof one & { category: ExpenseCategory } => isExpenseCategory(one.category))
      .map((one) => ({ category: one.category, totalPence: one.total_pence, vatPence: one.vat_pence, count: one.count })),
    mileage: { tenths: raw.mileage.tenths, trips: raw.mileage.trips },
  };

  return summariseBooks(facts, year.starts);
}

export interface ExpenseRow {
  id: string;
  category: ExpenseCategory;
  spentOn: string;
  amountPence: number;
  vatPence: number;
  note: string | null;
  receiptPath: string | null;
  vehicleName: string | null;
}

/** Every expense of a year, newest first. */
export async function expensesFor(businessId: string, year: TaxYear): Promise<ExpenseRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('expenses')
    .select('id, category, spent_on, amount_pence, vat_pence, note, receipt_path, vehicles(name, make, model, registration)')
    .eq('business_id', businessId)
    .gte('spent_on', year.from)
    .lte('spent_on', year.to)
    .order('spent_on', { ascending: false });
  if (error) return [];

  return data
    .filter((row) => isExpenseCategory(row.category))
    .map((row) => ({
      id: row.id,
      category: row.category,
      spentOn: row.spent_on,
      amountPence: row.amount_pence,
      vatPence: row.vat_pence,
      note: row.note,
      receiptPath: row.receipt_path,
      vehicleName: row.vehicles === null ? null : vehicleName(row.vehicles),
    }));
}

export interface VehicleRow {
  id: string;
  /** What to call it: make and model, else the name it was given before those were asked for. */
  name: string;
  registration: string | null;
  year: number | null;
  claimMethod: 'mileage' | 'actual_costs' | null;
}

export async function vehiclesFor(businessId: string): Promise<VehicleRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('vehicles')
    .select('id, name, make, model, year, registration, claim_method')
    .eq('business_id', businessId)
    .is('retired_at', null)
    .order('created_at');
  return (data ?? []).map((row) => ({
    id: row.id,
    name: vehicleName(row),
    registration: row.registration,
    year: row.year,
    claimMethod: row.claim_method,
  }));
}

export interface MileageRow {
  id: string;
  travelledOn: string;
  milesTenths: number;
  note: string | null;
  vehicleName: string;
}

/** Every trip of a year, newest first. */
export async function mileageFor(businessId: string, year: TaxYear): Promise<MileageRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('mileage_log')
    .select('id, travelled_on, miles_tenths, note, vehicles(name, make, model, registration)')
    .eq('business_id', businessId)
    .gte('travelled_on', year.from)
    .lte('travelled_on', year.to)
    .order('travelled_on', { ascending: false });

  return (data ?? []).map((row) => ({
    id: row.id,
    travelledOn: row.travelled_on,
    milesTenths: row.miles_tenths,
    note: row.note,
    vehicleName: vehicleName(row.vehicles),
  }));
}
