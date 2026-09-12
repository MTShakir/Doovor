import { cron } from 'inngest';
import { inngest } from '../client';
import { clearOldRateLimits } from '../maintenance';

/**
 * Housekeeping, once a day (NFR-SEC-03). Old rate limit windows are the first of several
 * things this sweeps up; stale holds and expired invitations join it in M2.
 */
export const maintenanceSweep = inngest.createFunction(
  { id: 'maintenance-sweep', name: 'Maintenance sweep', triggers: [cron('TZ=Europe/London 30 3 * * *')] },
  () => clearOldRateLimits(),
);
