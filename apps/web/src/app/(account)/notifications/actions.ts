'use server';

import { err, ok, type Result } from '@repo/core/result';
import { notificationPreferenceSchema } from '@repo/core/schemas/notification';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAccess } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** Everything here is about the person signed in, and nobody else: the policies say so. */
async function mine() {
  const { session } = await requireAccess();
  return { userId: session.userId, supabase: await createSupabaseServerClient() };
}

/** NTF-01: the inbox stops shouting once it has been read. */
export async function markAllRead(): Promise<Result<null>> {
  const { supabase } = await mine();
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null);
  if (error) return err('UNKNOWN');

  revalidatePath('/notifications');
  return ok(null);
}

const oneSchema = z.object({ id: z.uuid() });

export async function markRead(input: unknown): Promise<Result<null>> {
  const parsed = oneSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');

  const { supabase } = await mine();
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', parsed.data.id)
    .is('read_at', null);
  if (error) return err('UNKNOWN');

  revalidatePath('/notifications');
  return ok(null);
}

/**
 * NTF-04: one switch, on or off. A row is only written when somebody has actually chosen
 * something, so an account nobody has touched carries no settings at all.
 */
export async function setNotificationChannel(input: unknown): Promise<Result<null>> {
  const parsed = notificationPreferenceSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');

  const { userId, supabase } = await mine();
  const { category, channel, enabled } = parsed.data;

  const { error } = enabled
    ? await supabase
        .from('notification_preferences')
        .delete()
        .eq('user_id', userId)
        .eq('category', category)
        .eq('channel', channel)
    : await supabase
        .from('notification_preferences')
        .upsert(
          { user_id: userId, category, channel, enabled: false },
          { onConflict: 'user_id,category,channel' },
        );
  if (error) return err('UNKNOWN');

  revalidatePath('/notifications/settings');
  return ok(null);
}
