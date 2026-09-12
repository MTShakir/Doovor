import 'server-only';
import { cachedGeoProvider, postcodesIoProvider, type GeoPlace, type GeoProvider, type PostcodeStore } from '@repo/providers/geo';
import type { Database } from '@repo/db/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * The cache lives in the database as public reference data (COV-03). Reads use the caller's
 * own session; the write goes through `cache_postcode`, which only ever adds a row.
 */
function supabaseStore(supabase: SupabaseClient<Database>): PostcodeStore {
  return {
    get: async (postcode) => {
      const { data } = await supabase
        .from('postcodes')
        .select('postcode, outcode, latitude, longitude, admin_district, country')
        .eq('postcode', postcode)
        .maybeSingle();
      if (!data) return null;
      return {
        postcode: data.postcode,
        outcode: data.outcode,
        latitude: data.latitude,
        longitude: data.longitude,
        district: data.admin_district,
        country: data.country,
      };
    },
    put: async (place: GeoPlace) => {
      await supabase.rpc('cache_postcode', {
        p_postcode: place.postcode,
        p_outcode: place.outcode,
        p_latitude: place.latitude,
        p_longitude: place.longitude,
        p_district: place.district ?? undefined,
        p_country: place.country ?? undefined,
      });
    },
  };
}

export async function getGeoProvider(): Promise<GeoProvider> {
  const supabase = await createSupabaseServerClient();
  return cachedGeoProvider(postcodesIoProvider(), supabaseStore(supabase));
}
