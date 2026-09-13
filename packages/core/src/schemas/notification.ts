import { z } from 'zod';
import { notificationCategories, notificationChannels } from '../notifications/catalogue.ts';

/** One switch on the settings screen (NTF-04). */
export const notificationPreferenceSchema = z.object({
  category: z.enum(notificationCategories),
  channel: z.enum(notificationChannels),
  enabled: z.boolean(),
});

export type NotificationPreferenceInput = z.infer<typeof notificationPreferenceSchema>;

/** A browser saying "send push here" (NTF-01, M2-29). */
export const pushSubscriptionSchema = z.object({
  endpoint: z.url().max(1000),
  p256dh: z.string().min(10).max(200),
  auth: z.string().min(10).max(100),
  userAgent: z.string().max(300).optional(),
});

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;
