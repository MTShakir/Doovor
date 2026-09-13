/**
 * Every notification the platform sends (PRD Appendix B, NTF-01, NTF-03, NTF-04).
 *
 * One table, read by three things that must agree: the job that decides who hears about a
 * change, the settings screen where somebody switches a channel off, and the templates that
 * write the words. A kind that is not in here cannot be sent.
 */

/** Who a notification is written for. The same event reads differently to each of them. */
export type NotificationAudience = 'learner' | 'instructor' | 'school';

/** How it reaches them. In-app is the inbox, and is also the record that it happened. */
export const notificationChannels = ['in_app', 'email', 'push', 'sms'] as const;
export type NotificationChannel = (typeof notificationChannels)[number];

/** What somebody switches on and off in settings: a handful of groups, not thirteen rows. */
export const notificationCategories = ['bookings', 'reminders', 'money', 'account'] as const;
export type NotificationCategory = (typeof notificationCategories)[number];

export interface NotificationSpec {
  kind: NotificationKind;
  category: NotificationCategory;
  /** Who hears about it. */
  audiences: NotificationAudience[];
  /** The channels this kind may use. Preferences can only narrow this. */
  channels: NotificationChannel[];
  /**
   * A service message: something that happened to a booking or to money somebody has paid.
   * It always arrives in the inbox, whatever has been switched off (PECR, NFR-PRV-05).
   */
  essential: boolean;
}

/** The kinds, in the order Appendix B lists them. */
export const notificationKinds = [
  'booking.confirmed',
  'booking.requested',
  'booking.answered',
  'booking.reminder',
  'booking.rescheduled',
  'booking.cancelled',
  'payment.received',
  'payment.failed',
  'lesson_record.added',
  'credit.low',
  'verification.decided',
  'badge.expiring',
  'learner.joined',
] as const;

export type NotificationKind = (typeof notificationKinds)[number];

const PUSH_AND_EMAIL: NotificationChannel[] = ['in_app', 'push', 'email'];

export const notificationCatalogue: Record<NotificationKind, NotificationSpec> = {
  'booking.confirmed': {
    kind: 'booking.confirmed',
    category: 'bookings',
    audiences: ['learner', 'instructor', 'school'],
    channels: PUSH_AND_EMAIL,
    essential: true,
  },
  'booking.requested': {
    kind: 'booking.requested',
    category: 'bookings',
    audiences: ['instructor'],
    channels: PUSH_AND_EMAIL,
    essential: true,
  },
  'booking.answered': {
    kind: 'booking.answered',
    category: 'bookings',
    audiences: ['learner'],
    channels: PUSH_AND_EMAIL,
    essential: true,
  },
  'booking.reminder': {
    kind: 'booking.reminder',
    category: 'reminders',
    audiences: ['learner', 'instructor'],
    // The only kind that may text, and only on Pro (NTF-01, M2-30).
    channels: ['in_app', 'push', 'email', 'sms'],
    essential: false,
  },
  'booking.rescheduled': {
    kind: 'booking.rescheduled',
    category: 'bookings',
    audiences: ['learner', 'instructor', 'school'],
    channels: PUSH_AND_EMAIL,
    essential: true,
  },
  'booking.cancelled': {
    kind: 'booking.cancelled',
    category: 'bookings',
    audiences: ['learner', 'instructor', 'school'],
    channels: PUSH_AND_EMAIL,
    essential: true,
  },
  'payment.received': {
    kind: 'payment.received',
    category: 'money',
    audiences: ['learner', 'instructor', 'school'],
    channels: PUSH_AND_EMAIL,
    essential: true,
  },
  'payment.failed': {
    kind: 'payment.failed',
    category: 'money',
    audiences: ['learner', 'instructor', 'school'],
    channels: PUSH_AND_EMAIL,
    essential: true,
  },
  'lesson_record.added': {
    kind: 'lesson_record.added',
    category: 'account',
    audiences: ['learner'],
    channels: ['in_app', 'push'],
    essential: false,
  },
  'credit.low': {
    kind: 'credit.low',
    category: 'money',
    audiences: ['learner', 'instructor'],
    channels: PUSH_AND_EMAIL,
    essential: false,
  },
  'verification.decided': {
    kind: 'verification.decided',
    category: 'account',
    audiences: ['instructor', 'school'],
    channels: PUSH_AND_EMAIL,
    essential: true,
  },
  'badge.expiring': {
    kind: 'badge.expiring',
    category: 'account',
    audiences: ['instructor', 'school'],
    channels: PUSH_AND_EMAIL,
    essential: true,
  },
  'learner.joined': {
    kind: 'learner.joined',
    category: 'account',
    audiences: ['instructor', 'school'],
    channels: ['in_app', 'push'],
    essential: false,
  },
};

export function isNotificationKind(value: string): value is NotificationKind {
  return Object.hasOwn(notificationCatalogue, value);
}

const specsIn = (category: NotificationCategory): NotificationSpec[] =>
  Object.values(notificationCatalogue).filter((spec) => spec.category === category);

/** Every channel anything in this group can use, in the catalogue's order. */
export function channelsInCategory(category: NotificationCategory): NotificationChannel[] {
  const used = new Set(specsIn(category).flatMap((spec) => spec.channels));
  return notificationChannels.filter((channel) => used.has(channel));
}

/**
 * The channels somebody cannot switch off for this group. A service message always reaches
 * the inbox, so offering a switch that does nothing would be a lie (NFR-PRV-05).
 */
export function alwaysOnChannels(category: NotificationCategory): NotificationChannel[] {
  return specsIn(category).some((spec) => spec.essential) ? ['in_app'] : [];
}

/** What the settings screen actually offers for this group (NTF-04). */
export function switchableChannels(category: NotificationCategory): NotificationChannel[] {
  const fixed = new Set(alwaysOnChannels(category));
  return channelsInCategory(category).filter((channel) => !fixed.has(channel));
}

/** What the settings screen calls each group, and what it says it covers (NTF-04). */
export const categoryCopy: Record<NotificationCategory, { title: string; description: string }> = {
  bookings: {
    title: 'Lessons',
    description: 'Booked, moved, called off, and requests waiting for an answer.',
  },
  reminders: {
    title: 'Reminders',
    description: 'Before a lesson, so nobody is waiting on a doorstep.',
  },
  money: {
    title: 'Money',
    description: 'Payments, receipts and credit running low.',
  },
  account: {
    title: 'Your account',
    description: 'Your badge, your verification, lesson records and new learners.',
  },
};

export const channelCopy: Record<NotificationChannel, { title: string; description: string }> = {
  in_app: { title: 'In the app', description: 'Your notifications list.' },
  email: { title: 'Email', description: 'To the address on your account.' },
  push: { title: 'Push', description: 'On a phone with the app installed.' },
  sms: { title: 'Text message', description: 'Reminders only, on the Pro plan.' },
};
