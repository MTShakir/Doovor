import { NextResponse, type NextRequest } from 'next/server';
import { completeSignIn } from '@/lib/auth/complete-sign-in';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** OAuth (Google) returns here with a PKCE code (AUTH-01). */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const next = request.nextUrl.searchParams.get('next');
  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(await completeSignIn(next), request.url));
  }
  return NextResponse.redirect(new URL('/sign-in?error=link', request.url));
}
