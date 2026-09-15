import { defaultErrorCopy, type DomainErrorCode } from '@repo/core/errors';
import { keptDaysSchema } from '@repo/core/schemas/kept-days';
import { addDaysToLocalDate, todayInZone } from '@repo/core/time';
import { requiresMfa } from '@/lib/auth/portals';
import { getAccess } from '@/lib/auth/session';
import { lessonsFromToday, teachingProfiles } from '@/lib/lessons/teaching';

const noStore = { 'cache-control': 'no-store' };

function refuse(code: DomainErrorCode, status: number): Response {
  return Response.json({ ok: false, code, message: defaultErrorCopy[code] }, { status, headers: noStore });
}

/**
 * The lessons the signed-in person teaches today and tomorrow, for the phone to keep where there is
 * no signal (PRG-09, PRD 8.1, M4-09). `?days=` asks for more days, up to a week.
 *
 * The answer says whose lessons they are and which days it covers, so a phone keeps a whole day or
 * nothing, and never keeps one person's lessons for another. Somebody who teaches nowhere gets no
 * lessons rather than a refusal: the same phone may belong to a school's owner.
 */
export async function GET(request: Request): Promise<Response> {
  const result = await getAccess();
  if (!result) return refuse('NOT_AUTHENTICATED', 401);
  const { session, access } = result;
  // The same second step the portals ask for (AUTH-08).
  if (requiresMfa(access) && session.aal !== 'aal2') return refuse('MFA_REQUIRED', 403);

  const parsed = keptDaysSchema.safeParse({ days: new URL(request.url).searchParams.get('days') ?? undefined });
  if (!parsed.success) return refuse('VALIDATION_FAILED', 422);
  const { days } = parsed.data;

  const now = new Date();
  const today = todayInZone(now);
  try {
    const lessons = await lessonsFromToday(teachingProfiles(access), days, now);
    return Response.json(
      {
        ok: true,
        data: {
          owner: session.userId,
          days: Array.from({ length: days }, (_, index) => addDaysToLocalDate(today, index)),
          at: now.toISOString(),
          lessons,
        },
      },
      { headers: noStore },
    );
  } catch {
    // Nothing is sent that could be taken for an empty day.
    return refuse('UNKNOWN', 500);
  }
}
