import 'server-only';
import { brand } from '@repo/config/brand';
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

/** Entries the filters match, newest first, and whether there are older ones beyond them. */
async function readEntries(filters: AuditLogSearch, limit: number): Promise<{ entries: AuditEntry[]; more: boolean }> {
  const supabase = await createSupabaseServerClient();
  const actions = auditCategoryActions(filters.kind);
  const { data, error } = await supabase.rpc('admin_audit_log', {
    ...(actions === null ? {} : { p_actions: [...actions] }),
    ...(filters.person === '' ? {} : { p_person: filters.person }),
    ...(filters.business === '' ? {} : { p_business: filters.business }),
    ...(filters.from === undefined ? {} : { p_from: filters.from }),
    ...(filters.to === undefined ? {} : { p_to: filters.to }),
    ...(filters.before === undefined ? {} : { p_before_at: filters.before.at, p_before_id: filters.before.id }),
    // One more than is wanted, to know whether there is an older one.
    p_limit: limit + 1,
  });
  if (error) throw new Error(`Could not read the audit log: ${error.message}`);

  const rows = z.array(rowSchema).parse(data);
  return {
    more: rows.length > limit,
    entries: rows.slice(0, limit).map((row) => {
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
  };
}

/** The audit log, newest first, narrowed as staff asked, a page at a time (ADM-07, NFR-SEC-06, M5-22). */
export async function auditLog(filters: AuditLogSearch): Promise<AuditPage> {
  const { entries, more } = await readEntries(filters, AUDIT_PAGE_SIZE);
  const last = entries.at(-1);
  return { entries, older: more && last ? { at: last.occurredAt, id: last.id } : null };
}

/** The most entries one file holds. Beyond it, staff narrow the days and take another. */
export const AUDIT_EXPORT_LIMIT = 5000;

/** What the file is called: the product, the days it covers, and the day it was taken. */
export function auditExportName(filters: AuditLogSearch, when: Date): string {
  const days = filters.from ?? filters.to ? `-${filters.from ?? 'start'}-to-${filters.to ?? 'now'}` : '';
  return `${brand.shortName.toLowerCase()}-audit-log${days}-${when.toISOString().slice(0, 10)}.json`;
}

/**
 * The audit log as a file (ADM-07, D-173): every entry the filters match, newest first, stopped at
 * the cap so one download cannot ask for the whole history. The file says when it was cut short,
 * so staff know to narrow the days and take another.
 */
export async function auditLogForExport(filters: AuditLogSearch): Promise<{ entries: AuditEntry[]; capped: boolean }> {
  const { entries, more } = await readEntries(filters, AUDIT_EXPORT_LIMIT);
  return { entries, capped: more };
}
