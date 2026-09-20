import { auditLogSearchSchema } from '@repo/core/schemas/admin';
import { auditExportName, auditLogForExport } from '@/lib/admin/audit';
import { requirePortal } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * The audit log as a file (ADM-07, NFR-SEC-06, D-173), for the days and filters on the screen.
 *
 * The database decides what staff may read, as it does for the screen. Where the page walks back
 * through the log, a file takes everything the filters match up to a cap, and says so when there
 * was more. Taking the copy is written to the log itself.
 */
export async function GET(request: Request): Promise<Response> {
  await requirePortal('admin');
  const asked = new URL(request.url).searchParams;
  // The page a reader had reached says nothing about which days they want in the file.
  asked.delete('before');
  const filters = auditLogSearchSchema.parse(Object.fromEntries(asked));
  const { entries, capped } = await auditLogForExport(filters);

  const askedFor = {
    kind: filters.kind ?? null,
    person: filters.person === '' ? null : filters.person,
    business: filters.business === '' ? null : filters.business,
    from: filters.from ?? null,
    to: filters.to ?? null,
  };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('record_audit_export', { p_filters: askedFor, p_count: entries.length });
  if (error) return new Response('The download could not be recorded, so it was not made.', { status: 500 });

  const taken = new Date();
  const file = {
    exported_at: taken.toISOString(),
    asked_for: askedFor,
    entries_shown: entries.length,
    more_than_shown: capped,
    entries: entries.map((entry) => ({
      id: entry.id,
      occurred_at: entry.occurredAt,
      when: entry.when,
      action: entry.action,
      what: entry.what,
      who: entry.who,
      role: entry.role,
      about: entry.about,
      business: entry.business,
      before: entry.before,
      after: entry.after,
    })),
  };

  return new Response(`${JSON.stringify(file, null, 2)}\n`, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${auditExportName(filters, taken)}"`,
      'cache-control': 'no-store',
    },
  });
}
