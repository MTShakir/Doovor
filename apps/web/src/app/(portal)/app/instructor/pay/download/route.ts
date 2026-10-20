import type { NextRequest } from 'next/server';
import { requirePortal } from '@/lib/auth/session';
import { payCsv, payFileName, payWeek, weekFrom } from '@/lib/school/pay';

/** A week of an instructor's own pay from their school as a CSV file (MNY-06, D-291). */
export async function GET(request: NextRequest): Promise<Response> {
  const { access, session } = await requirePortal('instructor');
  const school = access.memberships.find((one) => one.businessType === 'school' && one.role === 'instructor');
  if (!school) return new Response('Not allowed', { status: 403 });

  const weekStart = weekFrom(request.nextUrl.searchParams.get('week') ?? undefined);
  const week = await payWeek(school.businessId, weekStart, session.userId);
  if (week === null) return new Response('Not allowed', { status: 403 });

  return new Response(payCsv(week), {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${payFileName(weekStart)}"`,
      'cache-control': 'private, no-store',
    },
  });
}
