import 'server-only';
import { setupSteps, type SetupStep } from '@repo/core/schemas/learner';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { learnerHealth } from '@/lib/learner/health';

export interface LearnerSetup {
  /** Still worth asking: not answered, and not skipped. In the order they are asked. */
  toAsk: SetupStep[];
  /** How many of the questions have an answer, which is what the card counts off. */
  answered: number;
  total: number;
}

/**
 * Getting started (LRN-02, D-183): the few things a learner is asked once they have signed up.
 *
 * Every answer lives where it belongs already, so this only works out which questions are still
 * open. A question that is answered anywhere else, such as the gearbox they gave at sign-up, was
 * never open to begin with.
 */
export async function learnerSetup(userId: string): Promise<LearnerSetup> {
  const supabase = await createSupabaseServerClient();
  const [profile, health, pickup] = await Promise.all([
    supabase.from('learner_profiles').select('transmission, theory_passed, setup_skipped').eq('user_id', userId).maybeSingle(),
    learnerHealth(userId),
    supabase.from('pickup_points').select('id', { count: 'exact', head: true }).eq('learner_id', userId).eq('is_default', true),
  ]);

  const skipped = new Set<string>(profile.data?.setup_skipped ?? []);
  const done: Record<SetupStep, boolean> = {
    pickup: (pickup.count ?? 0) > 0,
    disability: health !== null && health.hasDisability !== null,
    gearbox: profile.data?.transmission !== undefined && profile.data.transmission !== null,
    medication: health !== null && health.takesMedication !== null,
    theory: profile.data?.theory_passed !== undefined && profile.data.theory_passed !== null,
  };

  return {
    toAsk: setupSteps.filter((step) => !done[step] && !skipped.has(step)),
    answered: setupSteps.filter((step) => done[step]).length,
    total: setupSteps.length,
  };
}

export interface LearnerDriving {
  transmission: 'manual' | 'automatic' | null;
  /** True when they told us they passed within the last two years, null when they have not said. */
  theoryPassed: boolean | null;
}

/** The two answers about their driving that live on the profile rather than with their health. */
export async function learnerDriving(learnerId: string): Promise<LearnerDriving> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from('learner_profiles').select('transmission, theory_passed').eq('user_id', learnerId).maybeSingle();
  return { transmission: data?.transmission ?? null, theoryPassed: data?.theory_passed ?? null };
}
