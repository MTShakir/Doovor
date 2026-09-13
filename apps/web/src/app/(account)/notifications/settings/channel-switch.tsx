'use client';

import type { NotificationCategory, NotificationChannel } from '@repo/core/notifications';
import { Switch } from '@repo/ui/switch';
import { toast } from '@repo/ui/toast';
import { useState, useTransition } from 'react';
import { setNotificationChannel } from '../actions';

export interface ChannelSwitchProps {
  category: NotificationCategory;
  channel: NotificationChannel;
  label: string;
  description: string;
  enabled: boolean;
}

/**
 * One switch (NTF-04). It moves as soon as it is pressed and moves back if the save fails,
 * because a switch that waits for a round trip feels broken.
 */
export function ChannelSwitch({ category, channel, label, description, enabled }: ChannelSwitchProps) {
  const [, startTransition] = useTransition();
  const [chosen, setChosen] = useState<boolean | null>(null);
  const on = chosen ?? enabled;

  return (
    <Switch
      label={label}
      description={description}
      checked={on}
      onCheckedChange={(next) => {
        setChosen(next);
        startTransition(async () => {
          const result = await setNotificationChannel({ category, channel, enabled: next });
          if (!result.ok) {
            setChosen(!next);
            toast(result.message);
          }
        });
      }}
    />
  );
}
