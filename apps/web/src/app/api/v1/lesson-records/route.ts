import { defaultErrorCopy, parsePostgresError, type DomainErrorCode } from '@repo/core/errors';
import { lessonRecordSchema } from '@repo/core/schemas/lesson-record';
import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const noStore = { 'cache-control': 'no-store' };

/** How each refusal is answered, so the phone knows whether sending it again could ever help. */
const statusFor: Partial<Record<DomainErrorCode, number>> = {
  NOT_AUTHENTICATED: 401,
  NOT_ALLOWED: 403,
  NOT_FOUND: 404,
  ALREADY_RECORDED: 409,
  VALIDATION_FAILED: 422,
  TOO_CLOSE: 422,
};

function refuse(code: DomainErrorCode, status: number, message = defaultErrorCopy[code]): Response {
  return Response.json({ ok: false, code, message }, { status, headers: noStore });
}

/**
 * Only this app's own pages send records: a page on another site can neither send JSON here
 * without asking first, nor claim to be this origin.
 */
function fromThisApp(request: Request): boolean {
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) return false;
  const origin = request.headers.get('origin');
  if (origin !== null) return origin === new URL(request.url).origin;
  return request.headers.get('sec-fetch-site') === 'same-origin';
}

/**
 * Saves a lesson record (PRG-01, PRG-09, M4-05).
 *
 * One route for a record saved while there is signal and for one sent later from the phone's
 * outbox (ARCHITECTURE 11), which is why it is a route rather than a Server Action: a service
 * worker can call a route. The record's id is made on the phone, so sending it twice saves it
 * once; the answer says which (`saved`). A refusal that sending again will not change comes back
 * as 4xx, and anything else as 5xx, which the outbox tries again.
 */
export async function POST(request: Request): Promise<Response> {
  if (!fromThisApp(request)) return refuse('NOT_ALLOWED', 403);

  const session = await getSession();
  if (!session) return refuse('NOT_AUTHENTICATED', 401);

  const parsed = lessonRecordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return refuse('VALIDATION_FAILED', 422, parsed.error.issues[0]?.message ?? defaultErrorCopy.VALIDATION_FAILED);
  }
  const record = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('save_lesson_record', {
    p_id: record.id,
    p_booking_id: record.bookingId,
    p_ratings: record.ratings.map((one) => ({ skill_code: one.skillCode, rating: one.rating })),
    p_summary: record.summary,
    p_next_focus: record.nextFocus === '' ? undefined : record.nextFocus,
    p_homework: record.homework === '' ? undefined : record.homework,
    p_seconds_taken: record.secondsTaken,
  });
  if (error) {
    const { code } = parsePostgresError(error);
    return refuse(code, statusFor[code] ?? 500);
  }

  const saved = data as { id: string; saved: boolean; completed: boolean };
  revalidatePath('/app/instructor');
  revalidatePath('/app/instructor/diary');
  return Response.json(
    { ok: true, data: { id: saved.id, saved: saved.saved, completed: saved.completed } },
    { status: saved.saved ? 201 : 200, headers: noStore },
  );
}
