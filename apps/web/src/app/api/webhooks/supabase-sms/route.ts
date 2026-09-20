import { NextResponse, type NextRequest } from 'next/server';
import { handleSendSmsHook } from '@/lib/auth/send-sms-hook';

/**
 * Supabase Auth asking us to send a sign-in code (AUTH-02, D-192).
 *
 * The signature is checked on the raw body, because a body that has been parsed and written out
 * again is a different body and would never match. Everything else happens in `handleSendSmsHook`.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text();
  const answer = await handleSendSmsHook({
    body,
    headers: {
      id: request.headers.get('webhook-id'),
      timestamp: request.headers.get('webhook-timestamp'),
      signature: request.headers.get('webhook-signature'),
    },
  });
  return NextResponse.json(answer.body, { status: answer.status });
}
