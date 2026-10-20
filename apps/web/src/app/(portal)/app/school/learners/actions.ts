'use server';

import { parsePostgresError } from '@repo/core/errors';
import { err, ok, type Result } from '@repo/core/result';
import { revalidatePath } from 'next/cache';
import { z } from '@repo/core/zod';
import { requirePortal } from '@/lib/auth/session';
import { learnerAllocation, type LearnerAllocation } from '@/lib/school/allocation';
import { manualLearnerSchema } from '@repo/core/schemas/learner';
import { fieldErrors } from '@/lib/forms';
import { importRows, importSchema, linkNewLearner, type ImportOutcome, type Linked, type NewLearner } from '@/lib/learners/add';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const assignSchema = z.object({ learnerId: z.uuid(), instructorId: z.uuid() });

/** LRN-06: a school hands a learner to one of its instructors. The RPC checks and records it. */
export async function assignLearner(input: unknown): Promise<Result<null>> {
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');

  await requirePortal('school');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('assign_learner', {
    p_learner_id: parsed.data.learnerId,
    p_instructor_id: parsed.data.instructorId,
  });
  if (error) return err(parsePostgresError(error).code);

  revalidatePath('/app/school/learners');
  return ok(null);
}

/**
 * SCH-03: who suits a learner best, with why, and everybody else still teaching at the school. A
 * failure is an answer the sheet can live with: anybody can still be chosen by hand.
 */
export async function suggestInstructors(learnerId: unknown): Promise<Result<LearnerAllocation>> {
  const parsed = z.uuid().safeParse(learnerId);
  if (!parsed.success) return err('NOT_FOUND');

  const { access } = await requirePortal('school');
  const school = access.memberships.find(
    (one) => one.businessType === 'school' && (one.role === 'owner' || one.role === 'manager'),
  );
  if (!school) return err('NOT_ALLOWED');
  try {
    return ok(await learnerAllocation(school.businessId, parsed.data));
  } catch {
    return err('UNKNOWN', 'We could not work out who suits them best just now.');
  }
}

/** The school the person asking runs, as its owner or a manager. */
async function runningSchool(): Promise<string | null> {
  const { access } = await requirePortal('school');
  return access.memberships.find((one) => one.businessType === 'school' && (one.role === 'owner' || one.role === 'manager'))?.businessId ?? null;
}

/** The school's own list, through `add_school_learner`, with an instructor or nobody yet. */
function linkToSchool(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  schoolId: string,
  learner: NewLearner,
  instructorId: string | null,
  source: 'manual' | 'import',
): Promise<Linked> {
  return linkNewLearner(supabase, schoolId, learner, (learnerId) =>
    supabase.rpc('add_school_learner', {
      p_school_id: schoolId,
      p_learner_id: learnerId,
      p_instructor_id: instructorId ?? undefined,
      p_postcode: learner.postcode ?? undefined,
      p_transmission: learner.transmission ?? undefined,
      p_source: source,
    }),
  );
}

const schoolLearnerSchema = z.object({ instructorId: z.union([z.literal('').transform(() => null), z.uuid()]).default('') });

/** M9-27, LRN-01, D-294: a learner the school's office types in, with one of its instructors or nobody yet. */
export async function addSchoolLearner(input: unknown): Promise<Result<{ learnerId: string }>> {
  const parsed = manualLearnerSchema.safeParse(input);
  const who = schoolLearnerSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));
  if (!who.success) return err('VALIDATION_FAILED', undefined, { instructorId: 'Choose one of your instructors' });

  const schoolId = await runningSchool();
  if (!schoolId) return err('NOT_ALLOWED');
  const supabase = await createSupabaseServerClient();
  const result = await linkToSchool(supabase, schoolId, parsed.data, who.data.instructorId, 'manual');
  if (!result.ok) return err(result.code, result.reason);

  revalidatePath('/app/school/learners');
  return ok({ learnerId: result.learnerId });
}

/** M9-27, LRN-01: a batch of rows from a spreadsheet, each the school's learner with nobody yet. */
export async function importSchoolLearners(input: unknown): Promise<Result<ImportOutcome>> {
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');

  const schoolId = await runningSchool();
  if (!schoolId) return err('NOT_ALLOWED');
  const supabase = await createSupabaseServerClient();
  const outcome = await importRows(parsed.data.rows, (learner) => linkToSchool(supabase, schoolId, learner, null, 'import'));
  if (outcome.imported > 0) revalidatePath('/app/school/learners');
  return ok(outcome);
}
