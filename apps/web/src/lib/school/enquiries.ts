import 'server-only';
import { parsePostgresError, type PostgresErrorLike } from '@repo/core/errors';
import { formatUkMobile } from '@repo/core/phone';
import { err, type Result } from '@repo/core/result';
import { formatDate } from '@repo/core/time';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type EnquiryStatus = 'new' | 'offered' | 'taken' | 'closed';
export const enquiryStatuses: readonly EnquiryStatus[] = ['new', 'offered', 'taken', 'closed'];

/** Somebody who asked the school for lessons, written out here for the inbox (M9-16, D-288). */
export interface Enquiry {
  enquiryId: string;
  fullName: string;
  email: string | null;
  /** "07700 900123", as a person writes it. */
  phone: string | null;
  postcode: string;
  transmission: 'manual' | 'automatic' | null;
  note: string | null;
  source: 'public' | 'office';
  status: EnquiryStatus;
  /** "Tue 20 Oct". */
  receivedOn: string;
  closedReason: string | null;
}

/** What the inbox holds, a page of one status at a time, newest first. */
export async function schoolEnquiries(schoolId: string, status: EnquiryStatus): Promise<Enquiry[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('school_enquiries')
    .select('id, full_name, email, phone, postcode, transmission, note, source, status, created_at, closed_reason')
    .eq('school_id', schoolId)
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(200);
  return (data ?? []).map((row) => ({
    enquiryId: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone === null ? null : formatUkMobile(row.phone),
    postcode: row.postcode,
    transmission: row.transmission,
    note: row.note,
    source: row.source === 'office' ? 'office' : 'public',
    status: row.status,
    receivedOn: formatDate(new Date(row.created_at)),
    closedReason: row.closed_reason,
  }));
}

/** How many enquiries are in each part of the inbox. */
export async function enquiryCounts(schoolId: string): Promise<Record<EnquiryStatus, number>> {
  const supabase = await createSupabaseServerClient();
  const counts = await Promise.all(
    enquiryStatuses.map(async (status) => {
      const { count } = await supabase
        .from('school_enquiries')
        .select('id', { count: 'exact', head: true })
        .eq('school_id', schoolId)
        .eq('status', status);
      return [status, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(counts) as Record<EnquiryStatus, number>;
}

const fieldsInForm = new Set(['fullName', 'email', 'phone', 'postcode', 'transmission', 'note']);

/** A refusal from the database, said beside the field it is about where there is one. */
export function enquiryRefused<T>(error: PostgresErrorLike): Result<T> {
  const { code, context } = parsePostgresError(error);
  if (code === 'CONSENT_REQUIRED') return err('VALIDATION_FAILED', undefined, { agreed: 'Tick this so the school can pass the details on' });
  if (code === 'VALIDATION_FAILED' && context.reason === 'no_contact') {
    return err('VALIDATION_FAILED', undefined, { email: 'Enter an email address or a mobile number' });
  }
  if (code === 'VALIDATION_FAILED' && typeof context.field === 'string' && fieldsInForm.has(context.field)) {
    return err('VALIDATION_FAILED', undefined, { [context.field]: 'Check this and try again' });
  }
  if (code === 'RATE_LIMITED') return err('RATE_LIMITED', 'That is a lot of tries from here. Try again in an hour.');
  return err(code);
}
