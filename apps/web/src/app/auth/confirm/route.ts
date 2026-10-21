import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { completeSignIn } from '@/lib/auth/complete-sign-in';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const EMAIL_TYPES: readonly EmailOtpType[] = ['email', 'signup', 'magiclink', 'recovery', 'email_change', 'invite'];

function isEmailType(value: string | null): value is EmailOtpType {
  return value !== null && (EMAIL_TYPES as readonly string[]).includes(value);
}

/**
 * Email links (confirm sign-up, magic link, password reset, email change) land here.
 * Our templates send a token hash, which works on any device. Supabase's default templates
 * send a PKCE code instead, which works in the browser that asked; both are accepted so a
 * project left on default templates still works.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get('token_hash');
  const type = params.get('type');
  const code = params.get('code');
  const supabase = await createSupabaseServerClient();

  let ok = false;
  if (tokenHash && isEmailType(type)) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  } else if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  }

  if (!ok) return NextResponse.redirect(new URL('/sign-in?error=link', request.url));
  const destination =
    type === 'recovery' ? '/account/password' : (await madeForThem(supabase)) ? '/account/password?claimed=1' : await completeSignIn();
  return NextResponse.redirect(new URL(destination, request.url));
}

/**
 * Signing up with the email of an account an instructor or a school made for somebody confirms
 * that account, and is how they claim it (LRN-03, D-068). Supabase keeps nothing else the sign-up
 * form said, as it never changes an account it cannot be sure is the asker's, so the password typed
 * there was not kept, and a link to sign in sets none either: it is asked for now, until they have
 * chosen one (D-331). The account says it was made for them from the moment it is made.
 */
async function madeForThem(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>): Promise<boolean> {
  const { data } = await supabase.auth.getUser();
  return data.user?.user_metadata.made_for_them === true;
}
