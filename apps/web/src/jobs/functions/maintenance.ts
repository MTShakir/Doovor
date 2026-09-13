import { cron } from 'inngest';
import { inngest } from '../client';
import { clearExpiredInvitations, clearOldRateLimits, expireBookingRequests, extendRecurrences } from '../maintenance';

/**
 * Housekeeping, once a day (NFR-SEC-03, AUTH-07): old rate limit windows, and invitations
 * nobody accepted.
 */
export const maintenanceSweep = inngest.createFunction(
  { id: 'maintenance-sweep', name: 'Maintenance sweep', triggers: [cron('TZ=Europe/London 30 3 * * *')] },
  async () => ({ ...(await clearOldRateLimits()), ...(await clearExpiredInvitations()) }),
);

/**
 * A request nobody answered stops holding the slot when it lapses (R-12). Often, because
 * the difference between a slot that is held and one that is free is what people book on.
 */
export const requestExpirySweep = inngest.createFunction(
  { id: 'request-expiry-sweep', name: 'Expire booking requests', triggers: [cron('TZ=Europe/London */5 * * * *')] },
  () => expireBookingRequests(),
);

/**
 * A weekly slot with no end keeps a month of lessons in the diary (BOK-05). Early, before
 * anybody looks at their day, and a week that clashes is simply tried again tomorrow.
 */
export const recurrenceSweep = inngest.createFunction(
  { id: 'recurrence-sweep', name: 'Extend weekly slots', triggers: [cron('TZ=Europe/London 15 4 * * *')] },
  () => extendRecurrences(),
);
