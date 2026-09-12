import 'server-only';
import { openWindows, type AvailabilityException, type TimeRange, type WorkingHour } from '@repo/core/availability';
import { resolveBookingRules } from '@repo/core/booking-rules';
import { bookableSlots, type SlotRules } from '@repo/core/slots';
import { addDaysToLocalDate, localToUtc, type LocalDate } from '@repo/core/time';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface LessonOption {
  lessonTypeId: string;
  name: string;
  durationMinutes: number;
  pricePence: number;
}

export interface BookingDay {
  /** Slots inside the instructor's own hours, in order. */
  open: string[];
  /** The rest of the day, offered with a warning (R-04). */
  outOfHours: string[];
}

/** One day of an instructor's diary, as the booking sheet needs it (BOK-01, BOK-03). */
export async function bookingDay(
  instructorProfileId: string,
  date: LocalDate,
  durationMinutes: number,
  by: 'instructor' | 'learner' = 'instructor',
  now: Date = new Date(),
): Promise<BookingDay> {
  const supabase = await createSupabaseServerClient();
  const dayStart = localToUtc(date, '00:00') ?? now;
  const dayEnd = localToUtc(addDaysToLocalDate(date, 1), '00:00') ?? new Date(dayStart.getTime() + 86_400_000);

  const [profile, hours, exceptions, busy, platform] = await Promise.all([
    supabase
      .from('instructor_profiles')
      .select('buffer_minutes, instant_book, business_id, businesses!instructor_profiles_business_id_fkey(settings)')
      .eq('id', instructorProfileId)
      .maybeSingle(),
    supabase.from('working_hours').select('weekday, start_time, end_time').eq('instructor_id', instructorProfileId),
    supabase
      .from('availability_exceptions')
      .select('kind, starts_at, ends_at')
      .eq('instructor_id', instructorProfileId)
      .lt('starts_at', dayEnd.toISOString())
      .gt('ends_at', dayStart.toISOString()),
    supabase
      .from('bookings')
      .select('starts_at, ends_at, buffer_minutes, status')
      .eq('instructor_id', instructorProfileId)
      .lt('starts_at', dayEnd.toISOString())
      .gt('ends_at', new Date(dayStart.getTime() - 12 * 3_600_000).toISOString()),
    supabase.from('platform_settings').select('value').eq('key', 'booking_defaults').maybeSingle(),
  ]);

  const rules = resolveBookingRules(
    platform.data?.value as Record<string, unknown> | null,
    profile.data?.businesses.settings as Record<string, unknown> | null,
    { bufferMinutes: profile.data?.buffer_minutes, instantBook: profile.data?.instant_book },
  );
  const slotRules: SlotRules = {
    durationMinutes,
    stepMinutes: 30,
    bufferMinutes: rules.bufferMinutes,
    noticeHours: rules.noticeHours,
    horizonWeeks: rules.horizonWeeks,
  };

  const working: WorkingHour[] = (hours.data ?? []).map((row) => ({
    weekday: row.weekday,
    start: row.start_time.slice(0, 5),
    end: row.end_time.slice(0, 5),
  }));
  const away: AvailabilityException[] = (exceptions.data ?? []).map((row) => ({
    kind: row.kind,
    startsAt: new Date(row.starts_at),
    endsAt: new Date(row.ends_at),
  }));
  const holding: TimeRange[] = (busy.data ?? [])
    .filter((row) => ['pending_payment', 'requested', 'confirmed', 'in_progress', 'completed'].includes(row.status))
    .map((row) => ({
      startsAt: new Date(row.starts_at),
      endsAt: new Date(new Date(row.ends_at).getTime() + row.buffer_minutes * 60_000),
    }));

  const within: TimeRange = { startsAt: dayStart, endsAt: dayEnd };
  const windows = openWindows({
    hours: working,
    exceptions: away,
    from: addDaysToLocalDate(date, -1),
    to: addDaysToLocalDate(date, 1),
  });

  const open = bookableSlots({ windows, instructorBusy: holding, rules: slotRules, now, by, within });

  // Every half hour of the day, for an instructor who wants a time they are not open (R-04).
  const wholeDay = [{ startsAt: dayStart, endsAt: dayEnd }];
  const anyTime =
    by === 'instructor'
      ? bookableSlots({ windows: wholeDay, instructorBusy: holding, rules: slotRules, now, by, within })
      : [];
  const openAt = new Set(open.map((slot) => slot.getTime()));

  return {
    open: open.map((slot) => slot.toISOString()),
    outOfHours: anyTime.filter((slot) => !openAt.has(slot.getTime())).map((slot) => slot.toISOString()),
  };
}

/** The lessons an instructor can book, with the price for each length (R-05). */
export async function lessonOptions(instructorProfileId: string, businessId: string): Promise<LessonOption[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('lesson_prices')
    .select('lesson_type_id, duration_minutes, price_pence, instructor_id, lesson_types(name, is_active)')
    .eq('business_id', businessId)
    .order('duration_minutes');

  const byKey = new Map<string, LessonOption>();
  for (const row of data ?? []) {
    if (!row.lesson_types.is_active) continue;
    if (row.instructor_id !== null && row.instructor_id !== instructorProfileId) continue;
    const key = `${row.lesson_type_id}:${String(row.duration_minutes)}`;
    // A price set for this instructor wins over the one the Business set for everybody.
    if (byKey.has(key) && row.instructor_id === null) continue;
    byKey.set(key, {
      lessonTypeId: row.lesson_type_id,
      name: row.lesson_types.name,
      durationMinutes: row.duration_minutes,
      pricePence: row.price_pence,
    });
  }
  return [...byKey.values()].sort((a, b) => a.durationMinutes - b.durationMinutes);
}
