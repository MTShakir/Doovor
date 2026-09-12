import 'server-only';
import { defaultLabelFor, pickupPointSchema } from '@repo/core/schemas/pickup';
import { err, ok, type Result } from '@repo/core/result';
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
 * Saves a pickup point with the place it names (COV-04, M1-16).
 *
 * The postcode is looked up here, never sent from the browser, so what is stored is a place
 * the postcode service knows and not whatever coordinates a caller felt like.
 */
export async function savePickupPoint(input: unknown, target: SavePickupPoint): Promise<Result<{ id: string }>> {
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

  const values = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('pickup_points')
    .insert({
      learner_id: target.learnerId,
      business_id: target.businessId ?? null,
      kind: values.kind,
      label: values.label === '' ? defaultLabelFor(values.kind) : values.label,
      address: values.address,
      postcode: found.place.postcode,
      // Well known text, which is how PostGIS takes a point over the API.
      location: `SRID=4326;POINT(${String(found.place.longitude)} ${String(found.place.latitude)})`,
      is_default: values.isDefault,
    })
    .select('id')
    .single();
  if (error) return err('UNKNOWN', 'We could not save that address. Try again.');

  return ok({ id: data.id });
}
