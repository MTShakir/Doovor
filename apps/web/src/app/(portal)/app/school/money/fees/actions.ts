'use server';

import { parsePostgresError } from '@repo/core/errors';
import { err, ok, type Result } from '@repo/core/result';
import { schoolFeeTermsSchema, settleFeeSchema } from '@repo/core/school-fees';
import { formatCalendarDate } from '@repo/core/time';
import { requirePortal } from '@/lib/auth/session';
import { fieldErrors } from '@/lib/forms';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** Somebody running a school, as its owner or a manager; the database checks the rest. */
async function runsASchool(): Promise<boolean> {
  const { access } = await requirePortal('school');
  return access.memberships.some((one) => one.businessType === 'school' && (one.role === 'owner' || one.role === 'manager'));
}

/** SCH-09, D-287: what a linked instructor pays the school. */
export async function saveFeeTerms(input: unknown): Promise<Result<null>> {
  const parsed = schoolFeeTermsSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));
  if (!(await runsASchool())) return err('NOT_ALLOWED');

  const { linkId, period, fee, startsOn, freeWeeks, pupilFee } = parsed.data;
  const regular = period !== '';
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('set_school_fee_terms', {
    p_link_id: linkId,
    // Without a weekly or monthly fee, there is no amount or start to send.
    p_period: regular ? period : undefined,
    p_fee_pence: regular ? (fee ?? undefined) : undefined,
    p_starts_on: regular ? startsOn : undefined,
    p_free_weeks: regular ? freeWeeks : 0,
    p_pupil_fee_pence: pupilFee ?? undefined,
  });
  if (error) {
    const { code, context } = parsePostgresError(error);
    if (code === 'NOT_FOUND') return err('NOT_FOUND', 'This instructor is no longer linked to your school.');
    if (context.reason === 'in_past') return err('VALIDATION_FAILED', undefined, { startsOn: 'Start today or later' });
    if (context.reason === 'overlaps_last_fee' && typeof context.after === 'string') {
      return err('VALIDATION_FAILED', undefined, {
        startsOn: `Start after ${formatCalendarDate(context.after, { year: false })}, when the last fee already due ends`,
      });
    }
    return err(code);
  }
  return ok(null);
}

/** MNY-06, D-287: a fee paid outside the app, written off, or owed again after a mistake. */
export async function settleFee(input: unknown): Promise<Result<null>> {
  const parsed = settleFeeSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));
  if (!(await runsASchool())) return err('NOT_ALLOWED');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('settle_school_fee', {
    p_fee_id: parsed.data.feeId,
    p_outcome: parsed.data.outcome,
    p_note: parsed.data.note === '' ? undefined : parsed.data.note,
  });
  if (error) return err(parsePostgresError(error).code);
  return ok(null);
}
