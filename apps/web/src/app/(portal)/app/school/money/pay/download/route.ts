import type { NextRequest } from 'next/server';
import { requirePortal } from '@/lib/auth/session';
import { payCsv, payFileName, payWeek, weekFrom } from '@/lib/school/pay';

/**
 * A week of the school's instructor pay as a CSV file (MNY-06, D-291). A route rather than an action
 * because the answer is a file; who may read it is decided here and again by the database.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const { access } = await requirePortal('school');
  const school = access.memberships.find((one) => one.businessType === 'school' && (one.role === 'owner' || one.role === 'manager'));
  if (!school) return new Response('Not allowed', { status: 403 });

  const weekStart = weekFrom(request.nextUrl.searchParams.get('week') ?? undefined);
  const week = await payWeek(school.businessId, weekStart);
  if (week === null) return new Response('Not allowed', { status: 403 });

  return new Response(payCsv(week), {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${payFileName(weekStart)}"`,
      // Pay is nobody else's, and no cache anywhere should keep a copy.
      'cache-control': 'private, no-store',
    },
  });
}
