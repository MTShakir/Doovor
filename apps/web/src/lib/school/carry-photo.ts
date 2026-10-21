import 'server-only';
import { profileObjectPath } from '@repo/core/images';
import { avatarsBucket } from '@/lib/storage/images';
import type { createSupabaseServerClient } from '@/lib/supabase/server';

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * Copies the photo of an instructor's own profile to the one they have just been given at a
 * school, when that one has none (D-324). The database carries everything else over; a picture
 * lives in storage, so the app copies it, as a picture of its own: replacing either never takes
 * the other's away. Nothing here is worth failing the join for, since a photo can be added later.
 */
export async function carryPhotoOver(supabase: ServerClient, userId: string, schoolId: string): Promise<void> {
  const { data: profiles } = await supabase
    .from('instructor_profiles')
    .select('id, business_id, photo_path')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  const made = profiles?.find((one) => one.business_id === schoolId);
  const from = profiles?.find((one) => one.business_id !== schoolId && one.photo_path !== null)?.photo_path;
  // Nothing to bring, or somewhere that already has one.
  if (made?.photo_path !== null || !from) return;

  const path = profileObjectPath(made.id, crypto.randomUUID(), from.endsWith('.png') ? 'png' : 'webp');
  const { error } = await supabase.storage.from(avatarsBucket).copy(from, path);
  if (error) return;
  await supabase.from('instructor_profiles').update({ photo_path: path }).eq('id', made.id);
}
