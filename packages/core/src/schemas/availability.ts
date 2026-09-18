/**
 * The diary's own settings: the week an instructor works, and the exceptions to it
 * (DIA-01, DIA-02, M1-17).
 */

import { z } from '../zod';
import { isValidLocalDate, isValidLocalTime, localTimeToMinutes } from '../time/calendar.ts';

const localTime = z.string().trim().refine(isValidLocalTime, { error: 'Enter a time like 09:00' });

/** One day of the week, either not worked or worked between two times. */
export const workingDaySchema = z
  .object({
    weekday: z.number().int().min(1).max(7),
    working: z.boolean(),
    startTime: localTime,
    endTime: localTime,
  })
  .refine((day) => !day.working || localTimeToMinutes(day.endTime) > localTimeToMinutes(day.startTime), {
    error: 'The finish time has to be after the start time',
    path: ['endTime'],
  });

export const workingWeekSchema = z.object({
  days: z.array(workingDaySchema).length(7, { error: 'A week has seven days' }),
});

export type WorkingDay = z.infer<typeof workingDaySchema>;
export type WorkingWeek = z.infer<typeof workingWeekSchema>;

/** Why an instructor is away. Free text, because the reasons are endless (DIA-02). */
export const availabilityExceptionSchema = z
  .object({
    kind: z.enum(['open', 'blocked']),
    date: z.string().trim().refine(isValidLocalDate, { error: 'Enter a date' }),
    startTime: localTime,
    endTime: localTime,
    reason: z.string().trim().max(200, { error: 'Use 200 characters or fewer' }),
  })
  .refine(
    (value) =>
      !isValidLocalTime(value.startTime) ||
      !isValidLocalTime(value.endTime) ||
      localTimeToMinutes(value.endTime) > localTimeToMinutes(value.startTime),
    { error: 'The finish time has to be after the start time', path: ['endTime'] },
  );

export type AvailabilityException = z.infer<typeof availabilityExceptionSchema>;
