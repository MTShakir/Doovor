import 'server-only';
import { parsePostgresError, type PostgresErrorLike } from '@repo/core/errors';
import { formatUkMobile } from '@repo/core/phone';
import { err, type Result } from '@repo/core/result';
import { formatDate, formatDateTime } from '@repo/core/time';
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
  /** "Offered to Khan Driving and Price Driving, until Wed 21 Oct 14:00", while it is. */
  offeredTo: string | null;
  /** "Taken by Khan Driving" or "Given to Emma Clarke". */
  takenBy: string | null;
}

/** "A", "A and B", "A, B and C". */
function andList(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`;
}

/**
 * What the inbox holds, a page of one status at a time, newest first, with who each pupil is
 * offered to or taken by. Names come from the school's own team (D-289).
 */
export async function schoolEnquiries(
  schoolId: string,
  status: EnquiryStatus,
  names: { businesses: ReadonlyMap<string, string>; instructors: ReadonlyMap<string, string> },
): Promise<Enquiry[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('school_enquiries')
    .select('id, full_name, email, phone, postcode, transmission, note, source, status, created_at, closed_reason, taken_business_id, taken_instructor_id')
    .eq('school_id', schoolId)
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(200);
  const ids = (data ?? []).map((row) => row.id);
  const { data: offers } =
    status === 'offered' && ids.length > 0
      ? await supabase.from('school_enquiry_offers').select('enquiry_id, business_id, expires_at').in('enquiry_id', ids).eq('status', 'open')
      : { data: [] };
  const openOn = new Map<string, { names: string[]; until: number }>();
  for (const offer of offers ?? []) {
    const known = openOn.get(offer.enquiry_id) ?? { names: [], until: 0 };
    known.names.push(names.businesses.get(offer.business_id) ?? 'an instructor no longer linked');
    known.until = Math.max(known.until, Date.parse(offer.expires_at));
    openOn.set(offer.enquiry_id, known);
  }
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
    offeredTo: (() => {
      const open = openOn.get(row.id);
      return open === undefined ? null : `Offered to ${andList(open.names)}, until ${formatDateTime(new Date(open.until))}`;
    })(),
    takenBy:
      row.status !== 'taken'
        ? null
        : row.taken_instructor_id !== null
          ? `Given to ${names.instructors.get(row.taken_instructor_id) ?? 'one of your instructors'}`
          : `Taken by ${(row.taken_business_id === null ? undefined : names.businesses.get(row.taken_business_id)) ?? 'an instructor no longer linked'}`,
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
