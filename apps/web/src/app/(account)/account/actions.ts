'use server';

import { err, ok, type Result } from '@repo/core/result';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from '@repo/core/zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const sessionIdSchema = z.uuid();

/** AUTH-09: sign out one of your other devices. */
export async function revokeDevice(sessionId: unknown): Promise<Result<null>> {
  const parsed = sessionIdSchema.safeParse(sessionId);
  if (!parsed.success) return err('VALIDATION_FAILED');
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('revoke_my_session', { p_session_id: parsed.data });
  if (error) return err('UNKNOWN');
  if (!data) return err('NOT_FOUND', 'That device is already signed out.');
  revalidatePath('/account');
  return ok(null);
}

/** AUTH-09: log out on all devices, this one included. */
export async function signOutEverywhere(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: 'global' });
  redirect('/sign-in');
}

const deletionSchema = z.object({ reason: z.string().trim().max(500).optional() });

/** AUTH-09, NFR-PRV-03: ask for the account to be deleted. Processing arrives in M6. */
export async function requestDeletion(input: unknown): Promise<Result<null>> {
  const parsed = deletionSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('request_account_deletion', parsed.data.reason ? { p_reason: parsed.data.reason } : {});
  if (error) return err('UNKNOWN');
  revalidatePath('/account');
  return ok(null);
}
