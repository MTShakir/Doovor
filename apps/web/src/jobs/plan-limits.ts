import 'server-only';
import { planLimitsFrom, type PlanLimits } from '@repo/config/plans';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

export { planLimitsFrom, smsAllowance, type PlanLimits } from '@repo/config/plans';

/** The limits a super admin set, read once for a run of a job. */
export async function readPlanLimits(): Promise<PlanLimits> {
  const { data, error } = await getSupabaseServiceClient().rpc('system_plan_limits');
  if (error) throw new Error(`Could not read the plan limits: ${error.message}`);
  return planLimitsFrom(data);
}
