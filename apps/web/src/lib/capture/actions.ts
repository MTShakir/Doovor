'use server';

import { parsePostgresError, type PostgresErrorLike } from '@repo/core/errors';
import { err, ok, type Result } from '@repo/core/result';
import { areaCheckSchema, lessonRequestConsent, lessonRequestSchema, waitingListConsent, waitingListSchema } from '@repo/core/schemas/capture';
import type { Database } from '@repo/db/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from '@repo/core/zod';
import { fieldErrors } from '@/lib/forms';
import { getGeoProvider } from '@/lib/geo/provider';
import { cityPage } from '@/lib/public/city-page';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Coming soon (MKT-10, M5-10): where learners cannot yet find instructors through the app, they can
 * join their area's waiting list or post a lesson request. Anybody may, signed in or not, so the
 * database functions count their callers and decide who is emailed (D-117); these only check the
 * form and put the words agreed to on record.
 */

const areaSchema = z.object({ postcode: z.string(), postcodeArea: z.string(), open: z.boolean() });
const keptSchema = z.object({ postcodeArea: z.string() });

export interface AreaAnswer {
  postcode: string;
  postcodeArea: string;
  /** Learners can already find and book instructors here. */
  open: boolean;
  /** The launch city the postcode is in, with how many instructors its page lists. */
  city: { slug: string; name: string; instructorCount: number } | null;
}

/** A refusal from a capture function, said beside the field it is about where there is one. */
function refused<T>(error: PostgresErrorLike): Result<T> {
  const { code, context } = parsePostgresError(error);
  if (code === 'VALIDATION_FAILED' && typeof context.field === 'string') {
    return err('VALIDATION_FAILED', undefined, { [context.field]: 'Check this and try again' });
  }
  if (code === 'CONSENT_REQUIRED') {
    return err('VALIDATION_FAILED', undefined, { consent: 'Tick the box so we may keep this and email you about it' });
  }
  if (code === 'RATE_LIMITED') return err('RATE_LIMITED', 'That is a lot of tries from here. Try again in an hour.');
  return err(code);
}

async function cityFor(supabase: SupabaseClient<Database>, district: string | null): Promise<AreaAnswer['city']> {
  if (district === null) return null;
  const { data } = await supabase.from('city_districts').select('city_slug').eq('admin_district', district).maybeSingle();
  if (!data) return null;
  const page = await cityPage(data.city_slug, null, false);
  return page ? { slug: page.city.slug, name: page.city.name, instructorCount: page.instructors.length } : null;
}

/** Whether learners can find instructors near a postcode yet, and the city page near it. */
export async function checkArea(input: unknown): Promise<Result<AreaAnswer>> {
  const parsed = areaCheckSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  const supabase = await createSupabaseServerClient();
  // Counted before the postcode is looked up, so a caller over the limit costs nothing upstream.
  const { data, error } = await supabase.rpc('coming_soon_area', { p_postcode: parsed.data.postcode });
  if (error) return refused(error);
  const area = areaSchema.parse(data);

  const geo = await getGeoProvider();
  const found = await geo.lookup(area.postcode);
  if (!found.ok) {
    if (found.reason === 'UNAVAILABLE') return err('UNKNOWN', 'We could not check that postcode just now. Try again in a moment.');
    return err('VALIDATION_FAILED', undefined, { postcode: 'We could not find that postcode. Check it and try again' });
  }
  return ok({ ...area, city: await cityFor(supabase, found.place.district) });
}

export async function joinWaitingList(input: unknown): Promise<Result<{ postcodeArea: string }>> {
  const parsed = waitingListSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));
  const { postcode, fullName, email, transmission } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('join_area_waiting_list', {
    p_postcode: postcode,
    p_full_name: fullName,
    p_email: email,
    // The words shown beside the box, kept as the record of what was agreed to.
    p_consent: waitingListConsent(postcode),
    ...(transmission === undefined ? {} : { p_transmission: transmission }),
  });
  if (error) return refused(error);
  return ok(keptSchema.parse(data));
}

export async function postLessonRequest(input: unknown): Promise<Result<{ postcodeArea: string }>> {
  const parsed = lessonRequestSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));
  const request = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('post_lesson_request', {
    p_postcode: request.postcode,
    p_full_name: request.fullName,
    p_email: request.email,
    p_transmission: request.transmission,
    p_experience: request.experience,
    p_days: request.days,
    p_times: request.times,
    p_start_when: request.startWhen,
    p_consent: lessonRequestConsent(request.postcode),
    ...(request.phone === null ? {} : { p_phone: request.phone }),
    ...(request.budget === null ? {} : { p_budget_pence: request.budget }),
  });
  if (error) return refused(error);
  return ok(keptSchema.parse(data));
}

const tokenSchema = z.object({ token: z.uuid() });

/** Removes everything kept for the address the email's token belongs to. */
export async function removeMyDetails(input: unknown): Promise<Result<{ removed: number }>> {
  const parsed = tokenSchema.safeParse(input);
  if (!parsed.success) return err('NOT_FOUND', 'This link is not one of ours. Check the email it came in.');

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('leave_learner_capture', { p_token: parsed.data.token });
  if (error) return refused(error);
  return ok({ removed: data });
}
