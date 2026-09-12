import { avatarImage, badgeImage, profileObjectPath } from '@repo/core/images';
import type { Database } from '@repo/db/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clientEnv } from '@/env/client';

/** Profile pictures: public, because they appear on public profiles and city pages. */
export const avatarsBucket = 'avatars';
/** Badge photos: private, readable only by the instructor and the staff reviewing them. */
export const badgesBucket = 'badges';

export type ImageBucket = typeof avatarsBucket | typeof badgesBucket;

/**
 * Public address of a stored photo (M1-03). The database keeps the path only, so the address
 * follows whichever project is serving and a restored or moved project keeps working.
 */
export function avatarUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  return `${clientEnv.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${avatarsBucket}/${path}`;
}

const contentType = { [avatarsBucket]: avatarImage.outputType, [badgesBucket]: badgeImage.outputType };

/**
 * Uploads a prepared picture as the signed-in instructor. Storage checks the folder against
 * their own profiles, so a path outside it is refused whatever the app sends.
 */
export async function uploadProfileImage(
  supabase: SupabaseClient<Database>,
  bucket: ImageBucket,
  profileId: string,
  blob: Blob,
): Promise<string | null> {
  const path = profileObjectPath(profileId, crypto.randomUUID());
  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    contentType: contentType[bucket],
    cacheControl: '31536000',
  });
  return error ? null : path;
}

/** Removes the picture a new one replaced. A failure here is not worth telling anyone about. */
export async function removeProfileImage(
  supabase: SupabaseClient<Database>,
  bucket: ImageBucket,
  path: string | null,
): Promise<void> {
  if (path) await supabase.storage.from(bucket).remove([path]);
}

/** A badge photo is private, so it is shown through a short-lived address (INS-02). */
export async function signedBadgeUrl(
  supabase: SupabaseClient<Database>,
  path: string | null,
  seconds = 300,
): Promise<string | undefined> {
  if (!path) return undefined;
  const { data } = await supabase.storage.from(badgesBucket).createSignedUrl(path, seconds);
  return data?.signedUrl;
}
