/**
 * Asking for the lessons a phone keeps for where there is no signal (PRG-09, PRD 8.1, M4-09): today
 * and the days after it, in London. Two days by default, today and tomorrow, and never more than a
 * week, which is as far ahead as anybody teaching with no signal needs.
 */

import { z } from 'zod';

export const keptDaysSchema = z.object({
  days: z.coerce.number().int().min(1).max(7).default(2),
});

export type KeptDaysQuery = z.output<typeof keptDaysSchema>;
