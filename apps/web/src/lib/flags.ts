import 'server-only';
import { flagsFromSettings, type FlagOverrides } from '@repo/config/flags';
import { cacheLife, cacheTag, updateTag } from 'next/cache';
import { getSupabaseAnonymousClient } from '@/lib/supabase/anonymous';

const FLAGS_TAG = 'feature-flags';

async function storedFlags(): Promise<FlagOverrides> {
  'use cache';
  cacheLife('minutes');
  cacheTag(FLAGS_TAG);
  const { data, error } = await getSupabaseAnonymousClient().rpc('feature_flags');
  if (error) throw new Error(`Could not read the feature flags: ${error.message}`);
  return flagsFromSettings(data);
}

/**
 * The features a super admin has switched on or off (ADM-05, M5-20), the same for everybody. Kept
 * for minutes and read fresh the moment they change. A failed read leaves every feature at its
 * default rather than taking the sign-in page down with it, and is not kept.
 */
export async function featureFlags(): Promise<FlagOverrides> {
  try {
    return await storedFlags();
  } catch {
    return {};
  }
}

/** After a super admin changes a flag. Server Actions only. */
export function expireFeatureFlags(): void {
  updateTag(FLAGS_TAG);
}
