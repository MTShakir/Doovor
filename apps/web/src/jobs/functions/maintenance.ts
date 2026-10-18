import { cron } from 'inngest';
import { inngest } from '../client';
import { schedules } from '../schedules';
import {
  clearExpiredInvitations,
  clearOldRateLimits,
  eraseDueAccounts,
  extendRecurrences,
  pruneAuditTrail,
  removeUnreferencedFiles,
} from '../maintenance';

/**
 * Housekeeping, once a day (NFR-SEC-03, AUTH-07, NFR-PRV-03, D-158): old rate limit windows,
 * invitations nobody accepted, pictures nothing points to any more, and audit rows past the two
 * years the privacy notice gives.
 */
export const maintenanceSweep = inngest.createFunction(
  { id: 'maintenance-sweep', name: 'Maintenance sweep', triggers: [cron(schedules.maintenance)] },
  async () => ({
    ...(await clearOldRateLimits()),
    ...(await clearExpiredInvitations()),
    ...(await removeUnreferencedFiles()),
    ...(await pruneAuditTrail()),
  }),
);

/**
 * A weekly slot with no end keeps a month of lessons in the diary (BOK-05). Early, before
 * anybody looks at their day, and a week that clashes is simply tried again tomorrow.
 */
export const recurrenceSweep = inngest.createFunction(
  { id: 'recurrence-sweep', name: 'Extend weekly slots', triggers: [cron(schedules.recurrence)] },
  () => extendRecurrences(),
);

/**
 * An account asked to be deleted goes seven days later (NFR-PRV-03, AUTH-09). In the small hours,
 * because it cancels lessons still to come and nobody should watch that happen to their diary in
 * the middle of a working day.
 */
export const deletionSweep = inngest.createFunction(
  { id: 'deletion-sweep', name: 'Delete accounts that asked', triggers: [cron(schedules.deletion)] },
  () => eraseDueAccounts(),
);
