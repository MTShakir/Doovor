'use server';

import { parsePostgresError } from '@repo/core/errors';
import { wholeName } from '@repo/core/person-name';
import { err, ok, type Result } from '@repo/core/result';
import { accountNameSchema } from '@repo/core/schemas/account';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from '@repo/core/zod';
import { requireAccess } from '@/lib/auth/session';
import { fieldErrors } from '@/lib/forms';
import { ownBusiness } from '@/lib/auth/own-business';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * AUTH-09, D-217: the name on the account, and what the Business is called for somebody whose
 * Business is their own.
 *
 * The name learners see is a different thing and lives on the profile (D-196). This one is who
 * the account belongs to, which is what a receipt, an export and a support conversation use.
 */
export async function saveAccountName(input: unknown): Promise<Result<null>> {
  const parsed = accountNameSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  const { session, access } = await requireAccess();
  const supabase = await createSupabaseServerClient();

  const mine = ownBusiness(access);
  if (parsed.data.businessName !== undefined) {
    // At a school the name is not theirs to change, so a form that sent one anyway is refused
    // here as well as by the RPC.
    if (mine === null) return err('NOT_ALLOWED', 'Your school looks after that name.');
    const named = await supabase.rpc('set_business_name', { p_business_id: mine.businessId, p_name: parsed.data.businessName });
    if (named.error) return err(parsePostgresError(named.error).code, 'We could not save your business name. Try again.');
  }

  const { error } = await supabase
    .from('users')
    .update({ full_name: wholeName({ firstName: parsed.data.firstName, lastName: parsed.data.lastName }) })
    .eq('id', session.userId);
  if (error) return err('UNKNOWN', 'We could not save your name. Try again.');

  revalidatePath('/account');
  return ok(null);
}

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

/** Calling it off, while the seven days last (AUTH-09, M6-12, D-149). */
export async function cancelDeletion(): Promise<Result<null>> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('cancel_account_deletion');
  if (error) return err('UNKNOWN');
  revalidatePath('/account');
  return ok(null);
}
