import { cron } from 'inngest';
import { inngest } from '../client';
import { runRenewalNotices } from '../subscriptions';

/**
 * Once a day, early (9.18, D-237): warn anybody whose Pro renews inside its notice window, which
 * is a fortnight on a year and three days on a month.
 *
 * Eight in the morning London time, an hour after the badge sweep, so the two do not send at the
 * same minute and a text about money does not land in the night.
 */
export const subscriptionRenewalNotices = inngest.createFunction(
  {
    id: 'subscription-renewal-notices',
    name: 'Subscription renewal notices',
    triggers: [cron('TZ=Europe/London 0 8 * * *')],
  },
  () => runRenewalNotices(),
);
