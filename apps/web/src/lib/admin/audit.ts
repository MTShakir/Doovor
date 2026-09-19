import 'server-only';
import { auditCategoryActions, auditWords } from '@repo/core/audit';
import type { AuditCursor, AuditLogSearch } from '@repo/core/schemas/admin';
import { formatDateWithYear, formatTime } from '@repo/core/time';
import { z } from '@repo/core/zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const AUDIT_PAGE_SIZE = 50;

/**
 * One entry as the database hands it over. The generated types cannot tell which columns a function
 * leaves empty, so the rows are read the way any input is: nobody did what the platform did itself,
 * and not every entry is about a person or a Business.
 */
const rowSchema = z.object({
  id: z.string(),
  occurred_at: z.string(),
  action: z.string(),
  actor_name: z.string().nullable(),
  actor_email: z.string().nullable(),
  actor_role: z.string(),
  about_name: z.string().nullable(),
  about_email: z.string().nullable(),
  business_name: z.string().nullable(),
  before: z.unknown(),
  after: z.unknown(),
});

export interface AuditEntry {
  id: string;
  /** The moment exactly as recorded, for the page's time element. */
  occurredAt: string;
  /** "Thu 17 Sep 2026, 11:13", in London. */
  when: string;
  /** "Refund issued" */
  what: string;
  action: string;
  /** "Sue Staff (sue@example.com)", or the platform for what nobody did by hand. */
  who: string;
  /** Their standing when they did it: a staff role, a role at the Business, "user" or "system". */
  role: string;
  about: string | null;
  business: string | null;
  before: unknown;
  after: unknown;
}

export interface AuditPage {
  entries: AuditEntry[];
  /** Where the next, older page starts, when there is one. */
  older: AuditCursor | null;
}

function nameOf(name: string | null, email: string | null): string | null {
  const named = name === null || name === '' ? null : name;
  if (named !== null && email !== null) return `${named} (${email})`;
  return named ?? email;
}

/** The audit log, newest first, narrowed as staff asked, a page at a time (ADM-07, NFR-SEC-06, M5-22). */
export async function auditLog(filters: AuditLogSearch): Promise<AuditPage> {
  const supabase = await createSupabaseServerClient();
  const actions = auditCategoryActions(filters.kind);
  const { data, error } = await supabase.rpc('admin_audit_log', {
    ...(actions === null ? {} : { p_actions: [...actions] }),
    ...(filters.person === '' ? {} : { p_person: filters.person }),
    ...(filters.business === '' ? {} : { p_business: filters.business }),
    ...(filters.from === undefined ? {} : { p_from: filters.from }),
    ...(filters.to === undefined ? {} : { p_to: filters.to }),
    ...(filters.before === undefined ? {} : { p_before_at: filters.before.at, p_before_id: filters.before.id }),
    // One more than a page, to know whether there is an older one.
    p_limit: AUDIT_PAGE_SIZE + 1,
  });
  if (error) throw new Error(`Could not read the audit log: ${error.message}`);

  const rows = z.array(rowSchema).parse(data);
  const shown = rows.slice(0, AUDIT_PAGE_SIZE);
  const last = shown.at(-1);
  return {
    entries: shown.map((row) => {
      const at = new Date(row.occurred_at);
      return {
        id: row.id,
        occurredAt: row.occurred_at,
        when: `${formatDateWithYear(at)}, ${formatTime(at)}`,
        what: auditWords(row.action),
        action: row.action,
        who: row.actor_role === 'system' ? 'The platform' : (nameOf(row.actor_name, row.actor_email) ?? 'An account since deleted'),
        role: row.actor_role,
        about: nameOf(row.about_name, row.about_email),
        business: row.business_name,
        before: row.before,
        after: row.after,
      };
    }),
    older: rows.length > AUDIT_PAGE_SIZE && last ? { at: last.occurred_at, id: last.id } : null,
  };
}
