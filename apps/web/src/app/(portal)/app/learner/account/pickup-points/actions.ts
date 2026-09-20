'use server';

import { err, ok, type Result } from '@repo/core/result';
import { z } from '@repo/core/zod';
import { revalidatePath } from 'next/cache';
import { requirePortal } from '@/lib/auth/session';
import { removePickupPoint, savePickupPoint, updatePickupPoint } from '@/lib/pickup/save';

/**
 * A learner's own pickup points (COV-04, D-182). Theirs: the row carries no Business, so the
 * policies let them change it and a school may read it but never rewrite it.
 *
 * The card hands in the learner it is showing, which for this screen is always the person signed
 * in; anything else is somebody trying their luck, and the session decides either way.
 */
const mineSchema = z.object({ learnerId: z.uuid(), pickup: z.unknown() });
const oneOfMineSchema = z.object({ learnerId: z.uuid(), pickupId: z.uuid(), pickup: z.unknown().optional() });

const screen = '/app/learner/account/pickup-points';

export async function addMyPickup(input: unknown): Promise<Result<null>> {
  const parsed = mineSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');
  const { session } = await requirePortal('learner');
  if (parsed.data.learnerId !== session.userId) return err('NOT_ALLOWED');

  const saved = await savePickupPoint(parsed.data.pickup, { learnerId: session.userId, businessId: null });
  if (!saved.ok) return saved;
  revalidatePath(screen);
  return ok(null);
}

export async function updateMyPickup(input: unknown): Promise<Result<null>> {
  const parsed = oneOfMineSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');
  const { session } = await requirePortal('learner');
  if (parsed.data.learnerId !== session.userId) return err('NOT_ALLOWED');

  // Whose row it is, is the policies' business: one that is not theirs is simply not found.
  const saved = await updatePickupPoint(parsed.data.pickupId, parsed.data.pickup);
  if (!saved.ok) return saved;
  revalidatePath(screen);
  return ok(null);
}

export async function removeMyPickup(input: unknown): Promise<Result<null>> {
  const parsed = oneOfMineSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');
  const { session } = await requirePortal('learner');
  if (parsed.data.learnerId !== session.userId) return err('NOT_ALLOWED');

  const gone = await removePickupPoint(parsed.data.pickupId);
  if (!gone.ok) return gone;
  revalidatePath(screen);
  return ok(null);
}
