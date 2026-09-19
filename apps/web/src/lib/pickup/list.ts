import 'server-only';
import type { PickupKind } from '@repo/core/schemas/pickup';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** A learner's pickup point, as their card shows it to the Business (COV-04, D-168). */
export interface LearnerPickupPoint {
  id: string;
  kind: PickupKind;
  label: string;
  address: string;
  postcode: string | null;
  isDefault: boolean;
  /** Added by this Business, so it may correct or remove it; the learner's own are theirs. */
  ours: boolean;
}

/** The pickup points this Business may see for a learner, the default first. */
export async function learnerPickupPoints(learnerId: string, businessId: string): Promise<LearnerPickupPoint[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('pickup_points')
    .select('id, kind, label, address, postcode, is_default, business_id')
    .eq('learner_id', learnerId)
    .order('is_default', { ascending: false })
    .order('label');
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    kind: row.kind,
    label: row.label,
    address: row.address,
    postcode: row.postcode,
    isDefault: row.is_default,
    ours: row.business_id !== null && row.business_id === businessId,
  }));
}

/**
 * Where a learner's lessons start unless another place is chosen: their default pickup point
 * (COV-04, D-168). A lesson the instructor books takes it, so it shows on Today, in the lesson's
 * sheet and in Navigate.
 */
export async function defaultPickupFor(learnerId: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('pickup_points')
    .select('id')
    .eq('learner_id', learnerId)
    .eq('is_default', true)
    .maybeSingle();
  return data?.id ?? null;
}
