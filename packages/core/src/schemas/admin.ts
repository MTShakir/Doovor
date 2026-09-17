import { z } from 'zod';
import { auditCategoryKeys } from '../audit.ts';

/** What platform staff type to find a Business or a person (ADM-02). */
export const adminSearchSchema = z.string().trim().max(100, { error: 'Use 100 characters or fewer' });

/** Why a Business or an account is suspended: kept with it, and in the audit log (ADM-02, NFR-SEC-06). */
export const suspensionReasonSchema = z
  .string()
  .trim()
  .min(1, { error: 'Say why, so whoever looks at it next knows' })
  .max(500, { error: 'Use 500 characters or fewer' });

export const businessIdSchema = z.object({ businessId: z.uuid() });

export const suspendBusinessSchema = z.object({ businessId: z.uuid(), reason: suspensionReasonSchema });

export const userIdSchema = z.object({ userId: z.uuid() });

export const suspendAccountSchema = z.object({ userId: z.uuid(), reason: suspensionReasonSchema });

/** A postcode area as typed: "ls" is "LS" (ADM-04). */
export const postcodeAreaSchema = z.object({
  area: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{1,2}$/, { error: 'A postcode area is one or two letters, like M or LS' }),
});

/**
 * Where the next page of the audit log starts: after the entry at this moment with this id, newest
 * first (ADM-07). The moment is kept exactly as the database wrote it, so no fraction of a second
 * is lost and no entry is skipped or shown twice.
 */
export interface AuditCursor {
  at: string;
  id: string;
}

export function encodeAuditCursor(cursor: AuditCursor): string {
  return `${cursor.at}_${cursor.id}`;
}

export const auditCursorSchema = z
  .string()
  .transform((value) => {
    const split = value.lastIndexOf('_');
    return { at: split < 0 ? '' : value.slice(0, split), id: value.slice(split + 1) };
  })
  .pipe(z.object({ at: z.iso.datetime({ offset: true }), id: z.uuid() }));

/** A parameter's value in an address, the first one where it comes more than once. */
function firstOf(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The audit log's filters, as its address carries them (ADM-07): a kind of action, part of a
 * person's name or email, part of a Business's name, London days from and to, and where the page
 * starts. A filter that does not read as one is left out rather than refused, so a mistyped address
 * still opens the log.
 */
export const auditLogSearchSchema = z.object({
  kind: z.preprocess(firstOf, z.enum(auditCategoryKeys)).optional().catch(undefined),
  person: z.preprocess(firstOf, adminSearchSchema).catch(''),
  business: z.preprocess(firstOf, adminSearchSchema).catch(''),
  from: z.preprocess(firstOf, z.iso.date()).optional().catch(undefined),
  to: z.preprocess(firstOf, z.iso.date()).optional().catch(undefined),
  before: z.preprocess(firstOf, auditCursorSchema).optional().catch(undefined),
});

export type AuditLogSearch = z.output<typeof auditLogSearchSchema>;
