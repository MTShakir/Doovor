/**
 * Who hears about a change, and how (NTF-01, NTF-03, NTF-04).
 *
 * The job that reacts to an event knows the people; this decides what each of them gets. It
 * is pure, so the rule that an essential message always reaches the inbox is a unit test
 * rather than something to hope about in production.
 */

import {
  notificationCatalogue,
  type NotificationAudience,
  type NotificationCategory,
  type NotificationChannel,
  type NotificationKind,
} from './catalogue.ts';
import { notificationCopy, type NotificationFacts } from './copy.ts';

export interface NotificationRecipient {
  userId: string;
  audience: NotificationAudience;
  /** The channels this person has switched off for the kind's category (NTF-04). */
  muted?: NotificationChannel[];
  /** Channels their plan does not include, such as text messages below Pro (NTF-01). */
  unavailable?: NotificationChannel[];
}

export interface PlannedNotification {
  userId: string;
  kind: NotificationKind;
  category: NotificationCategory;
  audience: NotificationAudience;
  /** Where it is going, in the catalogue's order. Always at least one. */
  channels: NotificationChannel[];
  title: string;
  body: string;
  link: string | null;
  dedupeKey: string;
}

export interface NotificationPlanInput {
  kind: NotificationKind;
  /** What the notification is about: usually a booking id. */
  entityId: string;
  /**
   * Which version of that thing. A lesson moved twice is two notifications, not one that the
   * dedupe key swallowed, so the version of the row goes in the key (ARCHITECTURE 10).
   */
  version?: number | string;
  facts: NotificationFacts;
  recipients: NotificationRecipient[];
  /** Where tapping it should land, per audience. */
  linkFor?: (audience: NotificationAudience) => string | null;
}

/**
 * The key that stops a retried job sending the same thing twice. One per person, because a
 * lesson being cancelled is one notification each to three people.
 */
export function notificationDedupeKey(
  kind: NotificationKind,
  entityId: string,
  userId: string,
  version?: number | string,
): string {
  return [kind, entityId, version === undefined ? '0' : String(version), userId].join(':');
}

/**
 * What a channel list comes to once somebody's settings are applied. An essential message
 * keeps the inbox whatever has been switched off: it is the record that it happened, and
 * service messages are allowed without consent (NFR-PRV-05).
 */
export function channelsFor(kind: NotificationKind, recipient: NotificationRecipient): NotificationChannel[] {
  const spec = notificationCatalogue[kind];
  const off = new Set([...(recipient.muted ?? []), ...(recipient.unavailable ?? [])]);
  const left = spec.channels.filter((channel) => !off.has(channel));
  if (left.length > 0) return left;
  return spec.essential && spec.channels.includes('in_app') ? ['in_app'] : [];
}

/** Every notification one event comes to. Nobody outside the catalogue's audiences hears. */
export function planNotifications(input: NotificationPlanInput): PlannedNotification[] {
  const spec = notificationCatalogue[input.kind];
  const planned: PlannedNotification[] = [];
  const seen = new Set<string>();

  for (const recipient of input.recipients) {
    if (!spec.audiences.includes(recipient.audience)) continue;
    if (seen.has(recipient.userId)) continue;
    const channels = channelsFor(input.kind, recipient);
    if (channels.length === 0) continue;

    const { title, body } = notificationCopy(input.kind, recipient.audience, input.facts);
    seen.add(recipient.userId);
    planned.push({
      userId: recipient.userId,
      kind: input.kind,
      category: spec.category,
      audience: recipient.audience,
      channels,
      title,
      body,
      link: input.linkFor?.(recipient.audience) ?? null,
      dedupeKey: notificationDedupeKey(input.kind, input.entityId, recipient.userId, input.version),
    });
  }

  return planned;
}
