import { rangeFromParams } from '@repo/core/stats-range';
import { todayInZone } from '@repo/core/time';
import type { NextRequest } from 'next/server';
import { filtersFromParams, visitsCsv, visitsFileName } from '@/lib/admin/visitor-report';
import { visitRows } from '@/lib/admin/visitors';
import { requirePortal } from '@/lib/auth/session';

/**
 * The visits the Visitors screen shows, as a spreadsheet: the same days and the same filters, one
 * row a page opened (D-413). Nothing in it is about a person.
 */
export async function GET(request: NextRequest): Promise<Response> {
  await requirePortal('admin');
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const range = rangeFromParams({ range: params.range, from: params.from, to: params.to }, todayInZone());
  const rows = await visitRows(range, filtersFromParams(params));

  return new Response(visitsCsv(rows), {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${visitsFileName(range)}"`,
      'cache-control': 'private, no-store',
    },
  });
}
