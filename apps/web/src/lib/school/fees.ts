import 'server-only';
import { formatPence } from '@repo/core/money';
import { feeTermsWords, firstFeeOn, type FeePeriod, type FeeTerms } from '@repo/core/school-fees';
import { penceAsTyped } from '@repo/core/catalogue';
import { formatCalendarDate } from '@repo/core/time';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { schoolTeam } from './team';

export type FeeStatus = 'owed' | 'paid' | 'written_off';

/** A fee as both sides' statements show it, written out here: a client component may not read dates while prerendering. */
export interface FeeLine {
  feeId: string;
  /** "Week from Mon 9 Nov", "Month from Mon 9 Nov" or "A pupil introduced". */
  label: string;
  /** "Mon 9 Nov". */
  due: string;
  amountPence: number;
  status: FeeStatus;
  /** How it was paid, in the school's words. */
  note: string | null;
}

/** The terms as the school's form takes them. */
export interface TypedFeeTerms {
  period: '' | FeePeriod;
  fee: string;
  startsOn: string;
  freeWeeks: string;
  pupilFee: string;
}

export interface FeeStatement {
  linkId: string;
  terms: FeeTerms;
  typed: TypedFeeTerms;
  /** The terms in words, a line each. */
  words: string[];
  owedPence: number;
  fees: FeeLine[];
}

export interface LinkedFees extends FeeStatement {
  name: string;
  businessName: string;
}

interface LinkRow {
  id: string;
  fee_period: FeePeriod | null;
  fee_pence: number | null;
  fees_start_on: string | null;
  free_weeks: number;
  pupil_fee_pence: number | null;
}

interface FeeRow {
  id: string;
  link_id: string;
  kind: string;
  period_starts_on: string | null;
  period_ends_on: string | null;
  amount_pence: number;
  due_on: string;
  status: FeeStatus;
  settled_note: string | null;
}

const linkColumns = 'id, fee_period, fee_pence, fees_start_on, free_weeks, pupil_fee_pence';
const feeColumns = 'id, link_id, kind, period_starts_on, period_ends_on, amount_pence, due_on, status, settled_note';

function feeLine(row: FeeRow): FeeLine {
  const starts = row.period_starts_on;
  const weekly = starts !== null && row.period_ends_on !== null && Date.parse(row.period_ends_on) - Date.parse(starts) === 6 * 86_400_000;
  const label =
    row.kind === 'pupil' || starts === null
      ? 'A pupil introduced'
      : `${weekly ? 'Week' : 'Month'} from ${formatCalendarDate(starts, { year: false })}`;
  return { feeId: row.id, label, due: formatCalendarDate(row.due_on, { year: false }), amountPence: row.amount_pence, status: row.status, note: row.settled_note };
}

function statement(link: LinkRow, fees: FeeRow[]): FeeStatement {
  const terms: FeeTerms = {
    period: link.fee_period,
    feePence: link.fee_pence,
    startsOn: link.fees_start_on,
    freeWeeks: link.free_weeks,
    pupilFeePence: link.pupil_fee_pence,
  };
  const first = link.fees_start_on === null ? null : formatCalendarDate(firstFeeOn(link.fees_start_on, link.free_weeks), { year: false });
  const mine = fees.filter((fee) => fee.link_id === link.id);
  return {
    linkId: link.id,
    terms,
    typed: {
      period: link.fee_period ?? '',
      fee: penceAsTyped(link.fee_pence),
      startsOn: link.fees_start_on ?? '',
      freeWeeks: String(link.free_weeks),
      pupilFee: penceAsTyped(link.pupil_fee_pence),
    },
    words: feeTermsWords(terms, first),
    owedPence: mine.filter((fee) => fee.status === 'owed').reduce((total, fee) => total + fee.amount_pence, 0),
    fees: mine.map(feeLine),
  };
}

/**
 * What each instructor linked to a school pays it, and the fees raised, newest first (M9-11,
 * M9-13, D-287). The school's owner and managers read them; the database decides.
 */
export async function schoolFees(schoolId: string): Promise<LinkedFees[]> {
  const supabase = await createSupabaseServerClient();
  const [team, { data: links }, { data: fees }] = await Promise.all([
    schoolTeam(schoolId),
    supabase.from('school_links').select(linkColumns).eq('school_id', schoolId).eq('status', 'active'),
    supabase.from('school_fees').select(feeColumns).eq('school_id', schoolId).order('due_on', { ascending: false }).limit(500),
  ]);
  const byId = new Map((links ?? []).map((link) => [link.id, link]));
  return team.linked.flatMap((linked) => {
    const link = byId.get(linked.linkId);
    if (!link) return [];
    return [{ ...statement(link, fees ?? []), name: linked.name, businessName: linked.businessName }];
  });
}

/** What the instructor's own Business pays the school it is linked to, and the fees raised. */
export async function ownFees(businessId: string): Promise<FeeStatement | null> {
  const supabase = await createSupabaseServerClient();
  const { data: link } = await supabase.from('school_links').select(linkColumns).eq('business_id', businessId).eq('status', 'active').maybeSingle();
  if (!link) return null;
  const { data: fees } = await supabase
    .from('school_fees')
    .select(feeColumns)
    .eq('link_id', link.id)
    .order('due_on', { ascending: false })
    .limit(500);
  return statement(link, fees ?? []);
}

/** For the Money screen: how many instructors are linked to the school, and what they owe it. */
export async function feesOwedToSchool(schoolId: string): Promise<{ linked: number; owedPence: number }> {
  const supabase = await createSupabaseServerClient();
  const [{ count }, { data: owed }] = await Promise.all([
    supabase.from('school_links').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'active'),
    supabase.from('school_fees').select('amount_pence').eq('school_id', schoolId).eq('status', 'owed'),
  ]);
  return { linked: count ?? 0, owedPence: (owed ?? []).reduce((total, one) => total + one.amount_pence, 0) };
}

/** "£50 owed", or "Nothing owed". */
export function owedWords(pence: number): string {
  return pence === 0 ? 'Nothing owed' : `${formatPence(pence)} owed`;
}
