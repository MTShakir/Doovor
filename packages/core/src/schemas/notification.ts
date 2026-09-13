import { z } from 'zod';
import { notificationCategories, notificationChannels } from '../notifications/catalogue.ts';

/** One switch on the settings screen (NTF-04). */
export const notificationPreferenceSchema = z.object({
  category: z.enum(notificationCategories),
  channel: z.enum(notificationChannels),
  enabled: z.boolean(),
});

export type NotificationPreferenceInput = z.infer<typeof notificationPreferenceSchema>;
