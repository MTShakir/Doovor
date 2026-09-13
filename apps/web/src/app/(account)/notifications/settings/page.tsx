import {
  alwaysOnChannels,
  categoryCopy,
  channelCopy,
  channelsInCategory,
  notificationCategories,
} from '@repo/core/notifications';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { SkeletonRow } from '@repo/ui/skeleton';
import { ChevronLeft } from 'lucide-react';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import Link from 'next/link';
import { Suspense } from 'react';
import { clientEnv } from '@/env/client';
import { requireAccess } from '@/lib/auth/session';
import { myNotificationPreferences, mySubscribedBrowsers } from '@/lib/notifications/inbox';
import { ChannelSwitch } from './channel-switch';
import { PushSwitch } from './push-switch';

export const metadata: Metadata = { title: 'Notification settings', robots: { index: false } };

export default function NotificationSettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-2 pt-8" aria-busy>
          <SkeletonRow />
          <SkeletonRow />
        </div>
      }
    >
      <Settings />
    </Suspense>
  );
}

/** NTF-04: what somebody wants to hear about, and how. */
async function Settings() {
  // Somebody's own switches, which a prerendered shell cannot know.
  await connection();
  await requireAccess();
  const [off, browsers] = await Promise.all([myNotificationPreferences(), mySubscribedBrowsers()]);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/notifications"
        className="-ml-3 flex h-12 w-fit items-center gap-1 rounded-full px-3 text-body font-medium text-ink hover:bg-grey-100"
      >
        <ChevronLeft size={20} strokeWidth={1.5} aria-hidden />
        Notifications
      </Link>

      <div className="flex flex-col gap-2">
        <h1 className="text-h1 text-black">What you hear about</h1>
        <p className="text-body text-grey-700">
          Anything about a lesson you have booked, or money you have paid, always reaches your notifications
          list. The rest is up to you.
        </p>
      </div>

      <Card className="flex flex-col gap-1" role="region" aria-labelledby="push-title">
        <CardTitle id="push-title">Push notifications</CardTitle>
        <CardDescription>
          Push has to be turned on for each browser and each phone you use.
        </CardDescription>
        <div className="mt-2 flex flex-col divide-y divide-grey-200">
          <PushSwitch publicKey={clientEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''} anySubscribed={browsers > 0} />
        </div>
      </Card>

      {notificationCategories.map((category) => {
        const fixed = alwaysOnChannels(category);
        return (
          <Card key={category} className="flex flex-col gap-1" role="region" aria-labelledby={`${category}-title`}>
            <CardTitle id={`${category}-title`}>{categoryCopy[category].title}</CardTitle>
            <CardDescription>{categoryCopy[category].description}</CardDescription>
            {/* The same channels in the same order in every card, switch or not. */}
            <div className="mt-2 flex flex-col divide-y divide-grey-200">
              {channelsInCategory(category).map((channel) =>
                fixed.includes(channel) ? (
                  <p key={channel} className="flex min-h-12 items-center justify-between gap-4 py-2 text-body text-ink">
                    {channelCopy[channel].title}
                    <span className="text-small font-semibold text-grey-700">Always on</span>
                  </p>
                ) : (
                  <ChannelSwitch
                    key={channel}
                    category={category}
                    channel={channel}
                    label={channelCopy[channel].title}
                    description={channelCopy[channel].description}
                    enabled={!(off.get(category) ?? []).includes(channel)}
                  />
                ),
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
