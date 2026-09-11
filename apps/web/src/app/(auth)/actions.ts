'use server';

import { err, ok, type Result } from '@repo/core/result';
import {
  magicLinkSchema,
  newPasswordSchema,
  phoneCodeSchema,
  roleChoiceSchema,
  signInSchema,
  signUpSchema,
  ukMobileSchema,
} from '@repo/core/schemas/auth';
import { redirect } from 'next/navigation';

import { z } from 'zod';
import { getAppUrl } from '@/lib/app-url';
import { authErrorCopy } from '@/lib/auth/auth-errors';
import { completeSignIn } from '@/lib/auth/complete-sign-in';
import { safeNextPath } from '@/lib/auth/portals';
import { fieldErrors } from '@/lib/forms';
import { redirectTo } from '@/lib/redirect-to';
import { createSupabaseServerClient } from '@/lib/supabase/server';

function failed(code: string | undefined) {
  const copy = authErrorCopy(code);
  return err(copy.code, copy.message);
}

/** AUTH-01: email and password. */
export async function signInWithPassword(input: unknown, next?: string | null): Promise<Result<null>> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return failed(error.code);
  redirectTo(await completeSignIn(next));
}

/** AUTH-01, AUTH-03: create an account with the role chosen on the first screen. */
export async function signUp(input: unknown): Promise<Result<null>> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));
  const { email, password, fullName, role, schoolName } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, intended_role: role, ...(role === 'school' ? { school_name: schoolName } : {}) },
      emailRedirectTo: `${getAppUrl()}/auth/confirm`,
    },
  });
  // An existing email gets the same answer as a new one, so nobody can probe for accounts.
  if (error && error.code !== 'user_already_exists') return failed(error.code);
  redirect('/check-email');
}

/** AUTH-01: magic link. Unknown emails get the same answer. */
export async function sendMagicLink(input: unknown): Promise<Result<null>> {
  const parsed = magicLinkSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { shouldCreateUser: false, emailRedirectTo: `${getAppUrl()}/auth/confirm` },
  });
  if (error?.code?.startsWith('over_')) return failed(error.code);
  redirect('/check-email?kind=link');
}

/** Sign in with a text message code, for people with a verified mobile. */
export async function sendSignInCode(input: unknown): Promise<Result<{ phone: string }>> {
  const parsed = ukMobileSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, { phone: parsed.error.issues[0]?.message ?? '' });
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({ phone: parsed.data, options: { shouldCreateUser: false } });
  if (error?.code?.startsWith('over_')) return failed(error.code);
  return ok({ phone: parsed.data });
}

export async function verifySignInCode(input: unknown, next?: string | null): Promise<Result<null>> {
  const parsed = phoneCodeSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ phone: parsed.data.phone, token: parsed.data.code, type: 'sms' });
  if (error) return failed(error.code);
  redirectTo(await completeSignIn(next));
}

/** AUTH-02: a signed-in instructor adds and verifies their mobile. */
export async function startPhoneVerification(input: unknown): Promise<Result<{ phone: string }>> {
  const parsed = ukMobileSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, { phone: parsed.error.issues[0]?.message ?? '' });
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ phone: parsed.data });
  if (error) return failed(error.code);
  return ok({ phone: parsed.data });
}

export async function confirmPhoneVerification(input: unknown, next?: string | null): Promise<Result<null>> {
  const parsed = phoneCodeSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({
    phone: parsed.data.phone,
    token: parsed.data.code,
    type: 'phone_change',
  });
  if (error) return failed(error.code);
  redirectTo(safeNextPath(next, '/'));
}

/** AUTH-03 for people already signed in without a role (for example after Google). */
export async function chooseRole(input: unknown): Promise<Result<null>> {
  const parsed = roleChoiceSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirectTo(`/sign-up?role=${parsed.data.role}`);

  const { role, schoolName } = parsed.data;
  if (role === 'learner') {
    const { error } = await supabase.from('learner_profiles').upsert({ user_id: user.id }, { onConflict: 'user_id', ignoreDuplicates: true });
    if (error) return err('UNKNOWN');
  } else {
    const { data: profile } = await supabase.from('users').select('full_name').eq('id', user.id).single();
    const { error } = await supabase.rpc('create_business', {
      p_type: role === 'school' ? 'school' : 'independent',
      p_name: role === 'school' ? (schoolName ?? '') : profile?.full_name || 'My driving business',
    });
    if (error) return err('UNKNOWN');
  }
  redirectTo(await completeSignIn());
}

export async function requestPasswordReset(input: unknown): Promise<Result<null>> {
  const parsed = magicLinkSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo: `${getAppUrl()}/auth/confirm` });
  if (error?.code?.startsWith('over_')) return failed(error.code);
  redirect('/check-email?kind=reset');
}

export async function updatePassword(input: unknown): Promise<Result<null>> {
  const parsed = newPasswordSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return failed(error.code);
  redirectTo(await completeSignIn());
}

export async function signOut(scope: 'local' | 'global' = 'local'): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: z.enum(['local', 'global']).parse(scope) });
  redirect('/sign-in');
}
