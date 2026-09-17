import 'server-only';
import { todayInZone } from '@repo/core/time';
import { revalidateTag } from 'next/cache';
import { profileTags } from '@/lib/public/instructor-profile';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { sweepBadges, type BadgeStore, type BadgeSweepResult } from './badge-expiry';
import { badgeExpiring } from './events';
import { inngest } from './client';

const store: BadgeStore = {
  claimReminders: async (today) => {
    const { data, error } = await getSupabaseServiceClient().rpc('system_claim_badge_reminders', { p_today: today });
    if (error) throw new Error(`Could not claim badge reminders: ${error.message}`);
    return data.map((row) => ({
      instructorId: row.instructor_id,
      businessId: row.business_id,
      badgeExpiry: row.badge_expiry,
      daysBefore: row.days_before,
      daysLeft: row.days_left,
    }));
  },
  unlistExpired: async (today) => {
    const { data, error } = await getSupabaseServiceClient().rpc('system_unlist_expired_badges', { p_today: today });
    if (error) throw new Error(`Could not hide expired badges: ${error.message}`);
    return data;
  },
};

/**
 * The daily run (INS-03). The date is worked out in London, not UTC, so a job that fires at
 * one in the morning in British Summer Time still means today. A badge found out of date changes
 * what its public profile says, so the kept copies of profiles are read fresh (M5-06).
 */
export async function runBadgeExpirySweep(today: string = todayInZone()): Promise<BadgeSweepResult> {
  const result = await sweepBadges(
    store,
    (messages) =>
      inngest
        .send(
          messages.map((message) => ({
            name: badgeExpiring.name,
            data: {
              instructor_profile_id: message.instructorId,
              business_id: message.businessId,
              days_before: message.daysBefore,
              summary: message.summary,
            },
          })),
        )
        .then(() => undefined),
    today,
  );
  if (result.unlisted > 0) revalidateTag(profileTags.all, { expire: 0 });
  return result;
}
