import 'server-only';
import { getEntitlements, type PlanKey } from '@repo/config/plans';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

export type PlanLimits = Partial<Record<PlanKey, { smsRemindersPerMonth: number }>>;

function isPlan(value: string | null): value is PlanKey {
  return value === 'free' || value === 'pro' || value === 'school';
}

/** The limits as the platform settings keep them (ADM-05), leaving out anything that is not a whole number. */
export function planLimitsFrom(value: unknown): PlanLimits {
  const limits: PlanLimits = {};
  if (typeof value !== 'object' || value === null) return limits;
  for (const plan of ['free', 'pro', 'school'] as const) {
    const stored = (value as Record<string, unknown>)[plan];
    const sms = typeof stored === 'object' && stored !== null ? (stored as Record<string, unknown>).sms_reminders_per_month : undefined;
    if (typeof sms === 'number' && Number.isSafeInteger(sms) && sms >= 0) limits[plan] = { smsRemindersPerMonth: sms };
  }
  return limits;
}

/** The limits a super admin set, read once for a run of a job. */
export async function readPlanLimits(): Promise<PlanLimits> {
  const { data, error } = await getSupabaseServiceClient().rpc('system_plan_limits');
  if (error) throw new Error(`Could not read the plan limits: ${error.message}`);
  return planLimitsFrom(data);
}

/**
 * Text message reminders a Business may send a month (NTF-01): what the platform settings say for
 * its plan, or the plan's own allowance where they say nothing. Nothing for a plan that is not one.
 */
export function smsAllowance(plan: string | null, limits: PlanLimits): number {
  if (!isPlan(plan)) return 0;
  return limits[plan]?.smsRemindersPerMonth ?? getEntitlements(plan).smsRemindersPerMonth;
}
