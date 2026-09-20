'use server';

import { err, ok, type Result } from '@repo/core/result';
import {
  learnerGearboxSchema,
  learnerHealthSchema,
  learnerMedicationSchema,
  learnerTheorySchema,
  setupStepSchema,
} from '@repo/core/schemas/learner';
import { revalidatePath } from 'next/cache';
import { requirePortal } from '@/lib/auth/session';
import { fieldErrors } from '@/lib/forms';
import { writeMyHealth } from '@/lib/learner/health';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * What a learner tells us about themselves (LRN-02, D-180, D-183). Theirs to write and theirs to
 * change: the policies let nobody else touch these rows.
 *
 * The same answers are asked twice: once while getting started on the home screen, and again on
 * About you in their account, so both screens are refreshed whichever one was used.
 */
function saved(): void {
  revalidatePath('/app/learner');
  revalidatePath('/app/learner/account/about-you');
}

export async function saveMyHealth(input: unknown): Promise<Result<null>> {
  const parsed = learnerHealthSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  const { session } = await requirePortal('learner');
  const yes = parsed.data.hasDisability === 'yes';
  // A no keeps nothing: what they wrote before goes when the answer changes.
  const written = await writeMyHealth(session.userId, { has_disability: yes, details: yes ? (parsed.data.details ?? null) : null });
  if (!written) return err('UNKNOWN', 'We could not save that. Try again.');

  saved();
  return ok(null);
}

/** Taking it back: the answer goes, and their instructor sees nothing about it again (D-180). */
export async function removeMyHealth(): Promise<Result<null>> {
  const { session } = await requirePortal('learner');
  const written = await writeMyHealth(session.userId, { has_disability: null, details: null });
  if (!written) return err('UNKNOWN', 'We could not take that off your record. Try again.');

  saved();
  return ok(null);
}

export async function saveMyMedication(input: unknown): Promise<Result<null>> {
  const parsed = learnerMedicationSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  const { session } = await requirePortal('learner');
  const yes = parsed.data.takesMedication === 'yes';
  const written = await writeMyHealth(session.userId, {
    takes_medication: yes,
    medication_details: yes ? (parsed.data.details ?? null) : null,
  });
  if (!written) return err('UNKNOWN', 'We could not save that. Try again.');

  saved();
  return ok(null);
}

export async function removeMyMedication(): Promise<Result<null>> {
  const { session } = await requirePortal('learner');
  const written = await writeMyHealth(session.userId, { takes_medication: null, medication_details: null });
  if (!written) return err('UNKNOWN', 'We could not take that off your record. Try again.');

  saved();
  return ok(null);
}

export async function saveMyGearbox(input: unknown): Promise<Result<null>> {
  const parsed = learnerGearboxSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  const { session } = await requirePortal('learner');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('learner_profiles')
    .update({ transmission: parsed.data.transmission })
    .eq('user_id', session.userId);
  if (error) return err('UNKNOWN', 'We could not save that. Try again.');

  saved();
  return ok(null);
}

export async function saveMyTheory(input: unknown): Promise<Result<null>> {
  const parsed = learnerTheorySchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  const { session } = await requirePortal('learner');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('learner_profiles')
    .update({ theory_passed: parsed.data.theory === 'passed' })
    .eq('user_id', session.userId);
  if (error) return err('UNKNOWN', 'We could not save that. Try again.');

  saved();
  return ok(null);
}

/**
 * A question they would rather not answer now (D-183): it stops being asked, and stays on their
 * Account for whenever they change their mind.
 */
export async function skipSetupStep(input: unknown): Promise<Result<null>> {
  const parsed = setupStepSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');

  const { session } = await requirePortal('learner');
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from('learner_profiles').select('setup_skipped').eq('user_id', session.userId).maybeSingle();
  const already = data?.setup_skipped ?? [];
  if (already.includes(parsed.data.step)) return ok(null);

  const { error } = await supabase
    .from('learner_profiles')
    .update({ setup_skipped: [...already, parsed.data.step] })
    .eq('user_id', session.userId);
  if (error) return err('UNKNOWN', 'We could not skip that. Try again.');

  saved();
  return ok(null);
}
