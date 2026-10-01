/**
 * Warning somebody before Pro renews and takes their money (9.18, D-231, D-237).
 *
 * The rules are in core and the database decides who is inside their notice window, so this
 * module only decides what to say and on which channels. It holds no database or job-runner
 * code, which is what lets the whole thing be run against a fixed day.
 */

import { formatPence } from '@repo/core/money';
import type { NotificationChannel } from '@repo/core/notifications';
import {
  remindByText,
  renewalNoticeDays,
  subscriptionPricePence,
  type BillingInterval,
} from '@repo/core/subscription';
import { formatDateWithYear } from '@repo/core/time';

export interface RenewingSubscription {
  businessId: string;
  ownerUserId: string;
  interval: BillingInterval;
  renewsAt: Date;
  monthsPaid: number;
}

export interface RenewalNotice {
  businessId: string;
  userId: string;
  /** What the inbox, the email and the text all say. */
  detail: string;
  /** Which channels this one may use. A year is worth a text; a month is not (NTF-01, D-237). */
  channels: NotificationChannel[];
  /**
   * One notice per renewal, not one per day inside the window. The day it renews is in the key,
   * so next year's notice is a new row and this year's cannot be written twice.
   */
  dedupeKey: string;
}

/** Only ever these, in this order, so the inbox is never left out. */
const withoutText: NotificationChannel[] = ['in_app', 'push', 'email'];
const withText: NotificationChannel[] = ['in_app', 'push', 'email', 'sms'];

/**
 * What to say and to whom. The price is worked out the same way the charge will be, from the run
 * of months the database keeps, so the warning names the number that is actually coming out
 * rather than the list price.
 */
export function renewalNotices(due: RenewingSubscription[]): RenewalNotice[] {
  return due.map((one) => {
    const pence = subscriptionPricePence({ interval: one.interval, monthsPaidInARow: one.monthsPaid });
    const every = one.interval === 'year' ? 'for another year' : 'for another month';
    const day = formatDateWithYear(one.renewsAt);
    return {
      businessId: one.businessId,
      userId: one.ownerUserId,
      detail: `${formatPence(pence)} on ${day} ${every}. You can stop it before then on your plan screen.`,
      channels: remindByText(one.interval) ? withText : withoutText,
      dedupeKey: `subscription:${one.businessId}:renews:${one.renewsAt.toISOString().slice(0, 10)}`,
    };
  });
}

/** How many days of warning each interval gets, for anything that needs to say so. */
export { renewalNoticeDays };
