import 'server-only';
import { defaultLabelFor, pickupPointSchema, type PickupPoint } from '@repo/core/schemas/pickup';
import { err, ok, type Result } from '@repo/core/result';
import type { GeoPlace } from '@repo/providers/geo';
import { getGeoProvider } from '@/lib/geo/provider';
import { fieldErrors } from '@/lib/forms';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface SavePickupPoint {
  /** The learner it belongs to. Their own id when they add it themselves. */
  learnerId: string;
  /** Set when a Business adds it for a learner, so the policy can tell the two apart. */
  businessId?: string | null;
}

/**
 * A pickup point as typed, with the place its postcode names (COV-04, M1-16). The postcode is
 * looked up here, never sent from the browser, so what is stored is a place the postcode service
 * knows and not whatever coordinates a caller felt like.
 */
async function checked(input: unknown): Promise<Result<{ values: PickupPoint; place: GeoPlace }>> {
  const parsed = pickupPointSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  const geo = await getGeoProvider();
  const found = await geo.lookup(parsed.data.postcode);
  if (!found.ok) {
    if (found.reason === 'UNAVAILABLE') {
      return err('UNKNOWN', 'We could not check that postcode just now. Try again in a moment.');
    }
    return err('VALIDATION_FAILED', undefined, {
      postcode:
        found.reason === 'NOT_FOUND'
          ? 'We could not find that postcode. Check it and try again'
          : 'Enter a UK postcode like LS1 4DY',
    });
  }
  return ok({ values: parsed.data, place: found.place });
}

/** The columns a pickup point is stored as, from what was typed and the place found. */
function columns(values: PickupPoint, place: GeoPlace) {
  return {
    kind: values.kind,
    label: values.label === '' ? defaultLabelFor(values.kind) : values.label,
    address: values.address,
    postcode: place.postcode,
    // Well known text, which is how PostGIS takes a point over the API.
    location: `SRID=4326;POINT(${String(place.longitude)} ${String(place.latitude)})`,
    is_default: values.isDefault,
  };
}

/** Saves a new pickup point (COV-04, M1-16). */
export async function savePickupPoint(input: unknown, target: SavePickupPoint): Promise<Result<{ id: string }>> {
  const result = await checked(input);
  if (!result.ok) return result;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('pickup_points')
    .insert({ learner_id: target.learnerId, business_id: target.businessId ?? null, ...columns(result.data.values, result.data.place) })
    .select('id')
    .single();
  if (error) return err('UNKNOWN', 'We could not save that address. Try again.');

  return ok({ id: data.id });
}

/**
 * Corrects a pickup point (COV-04, D-168). The policies decide which: a learner their own, a
 * Business the ones it added. One that is not the caller's to change is simply not found.
 */
export async function updatePickupPoint(pickupId: string, input: unknown): Promise<Result<null>> {
  const result = await checked(input);
  if (!result.ok) return result;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('pickup_points')
    .update(columns(result.data.values, result.data.place))
    .eq('id', pickupId)
    .select('id');
  if (error) return err('UNKNOWN', 'We could not save that address. Try again.');
  return data.length === 0 ? err('NOT_FOUND', 'That pickup point is not one you can change.') : ok(null);
}

/** Takes a pickup point away (COV-04, D-168), on the same terms as correcting one. */
export async function removePickupPoint(pickupId: string): Promise<Result<null>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('pickup_points').delete().eq('id', pickupId).select('id');
  if (error) return err('UNKNOWN', 'We could not remove that address. Try again.');
  return data.length === 0 ? err('NOT_FOUND', 'That pickup point is not one you can remove.') : ok(null);
}
