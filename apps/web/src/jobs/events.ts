import { eventType, staticSchema } from 'inngest';

/**
 * Every event the app sends. They carry identifiers only, never personal data, because they
 * leave the United Kingdom (ARCHITECTURE 9). Each milestone adds the events it needs.
 */
export const systemPing = eventType('system/ping', { schema: staticSchema<{ at: string }>() });

/** A badge is running out (INS-03). The summary is copy, not personal data. */
export const badgeExpiring = eventType('instructor/badge-expiring', {
  schema: staticSchema<{
    instructor_profile_id: string;
    business_id: string;
    days_before: number;
    summary: string;
  }>(),
});
