import { cron } from 'inngest';
import { inngest } from '../client';
import { runBadgeExpirySweep } from '../badges';

/**
 * Once a day, early (INS-03): warn about badges running out at sixty, thirty and seven days,
 * then take any that have run out off the public site. Seven in the morning London time, so
 * the email is waiting rather than arriving in the night.
 */
export const badgeExpirySweep = inngest.createFunction(
  { id: 'badge-expiry-sweep', name: 'Badge expiry sweep', triggers: [cron('TZ=Europe/London 0 7 * * *')] },
  () => runBadgeExpirySweep(),
);
