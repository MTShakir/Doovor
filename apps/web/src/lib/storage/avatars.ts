import { avatarImage, avatarObjectPath } from '@repo/core/images';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@repo/db/types';
import { clientEnv } from '@/env/client';

export const avatarsBucket = 'avatars';

/**
 * Public address of a stored photo (M1-03). The database keeps the path only, so the address
 * follows whichever project is serving and a restored or moved project keeps working.
 */
export function avatarUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  return `${clientEnv.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${avatarsBucket}/${path}`;
}

/**
 * Uploads a prepared picture as the signed-in instructor. Storage checks the folder against
 * their own profiles, so a path outside it is refused whatever the app sends.
 */
export async function uploadAvatar(
  supabase: SupabaseClient<Database>,
  profileId: string,
  blob: Blob,
): Promise<string | null> {
  const path = avatarObjectPath(profileId, crypto.randomUUID());
  const { error } = await supabase.storage.from(avatarsBucket).upload(path, blob, {
    contentType: avatarImage.outputType,
    cacheControl: '31536000',
  });
  return error ? null : path;
}

/** Removes the picture a new one replaced. A failure here is not worth telling anyone about. */
export async function removeAvatar(supabase: SupabaseClient<Database>, path: string | null): Promise<void> {
  if (path) await supabase.storage.from(avatarsBucket).remove([path]);
}
