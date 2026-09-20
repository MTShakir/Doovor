import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface LearnerHealth {
  /** Null where they have not answered: a row may hold one answer and not the other (D-183). */
  hasDisability: boolean | null;
  details: string | null;
  takesMedication: boolean | null;
  medicationDetails: string | null;
  /** When they last told us, which is when they agreed to us holding it. */
  toldAt: string;
}

/**
 * What a learner told us about a disability or about medication (LRN-02, D-180, D-183). Null when
 * they have answered neither.
 *
 * The policies decide who reads it: the learner themselves, and whoever may see their card. This
 * is used for both, so an instructor's screen asks the same way a learner's does.
 */
export async function learnerHealth(learnerId: string): Promise<LearnerHealth | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('learner_health')
    .select('has_disability, details, takes_medication, medication_details, told_at')
    .eq('user_id', learnerId)
    .maybeSingle();
  if (!data) return null;
  return {
    hasDisability: data.has_disability,
    details: data.details,
    takesMedication: data.takes_medication,
    medicationDetails: data.medication_details,
    toldAt: data.told_at,
  };
}

/** The columns one question owns, so answering it never disturbs the other's answer (D-183). */
type HealthAnswer = Partial<{
  has_disability: boolean | null;
  details: string | null;
  takes_medication: boolean | null;
  medication_details: string | null;
}>;

/**
 * Writes one of the two answers as the learner themselves: a row that is not there is made, and a
 * row that ends up saying nothing at all is taken away, since that is what the table is for.
 */
export async function writeMyHealth(userId: string, answer: HealthAnswer): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const held = await learnerHealth(userId);
  const next = {
    has_disability: 'has_disability' in answer ? (answer.has_disability ?? null) : (held?.hasDisability ?? null),
    details: 'details' in answer ? (answer.details ?? null) : (held?.details ?? null),
    takes_medication: 'takes_medication' in answer ? (answer.takes_medication ?? null) : (held?.takesMedication ?? null),
    medication_details: 'medication_details' in answer ? (answer.medication_details ?? null) : (held?.medicationDetails ?? null),
    told_at: new Date().toISOString(),
  };

  if (next.has_disability === null && next.takes_medication === null) {
    if (held === null) return true;
    const { error } = await supabase.from('learner_health').delete().eq('user_id', userId);
    return !error;
  }

  const { error } =
    held === null
      ? await supabase.from('learner_health').insert({ user_id: userId, ...next })
      : await supabase.from('learner_health').update(next).eq('user_id', userId);
  return !error;
}
