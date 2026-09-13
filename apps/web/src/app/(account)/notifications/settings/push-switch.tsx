'use client';

import { Button } from '@repo/ui/button';
import { toast } from '@repo/ui/toast';
import { useEffect, useState, useTransition } from 'react';
import { subscribeToPush, unsubscribeFromPush } from '../actions';

export interface PushSwitchProps {
  /** The VAPID public key, which is public by design: it identifies the sender. */
  publicKey: string;
  /** Whether this account has any browser signed up at all. */
  anySubscribed: boolean;
}

type State = 'checking' | 'unsupported' | 'off' | 'on' | 'blocked' | 'not-configured';

/** The key crosses to the push service as bytes, not as text. */
function keyBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64Url.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** What the browser hands back, in the shape the server stores (NTF-01). */
function detailsOf(subscription: PushSubscription): { endpoint: string; p256dh: string; auth: string } | null {
  const json = subscription.toJSON();
  const keys = json.keys ?? {};
  return json.endpoint && keys.p256dh && keys.auth
    ? { endpoint: json.endpoint, p256dh: keys.p256dh, auth: keys.auth }
    : null;
}

/**
 * Turning push on for this browser (NTF-01, M2-29).
 *
 * The service worker is registered here rather than on every page: somebody who never turns
 * push on never gets one. Permission is asked for only when they press the button, because a
 * browser that is asked out of nowhere is a browser that says no for ever.
 */
export function PushSwitch({ publicKey, anySubscribed }: PushSwitchProps) {
  const [state, setState] = useState<State>('checking');
  const [pending, startTransition] = useTransition();

  // What this browser can do is only knowable in the browser, so it is worked out after the
  // first render rather than during it.
  useEffect(() => {
    let current = true;
    const check = async (): Promise<State> => {
      if (publicKey === '') return 'not-configured';
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        return 'unsupported';
      }
      if (Notification.permission === 'denied') return 'blocked';
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      return subscription ? 'on' : 'off';
    };

    void check().then((next) => {
      if (current) setState(next);
    });
    return () => {
      current = false;
    };
  }, [publicKey]);

  const turnOn = () => {
    startTransition(async () => {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'blocked' : 'off');
        return;
      }

      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(publicKey),
      });

      const details = detailsOf(subscription);
      if (!details) {
        toast('This browser did not give us what we need to send you anything.');
        return;
      }

      const result = await subscribeToPush({ ...details, userAgent: navigator.userAgent.slice(0, 300) });
      if (!result.ok) {
        toast(result.message);
        return;
      }
      setState('on');
      toast('Push is on for this browser');
    });
  };

  const turnOff = () => {
    startTransition(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        await unsubscribeFromPush({ endpoint });
      }
      setState('off');
      toast('Push is off for this browser');
    });
  };

  return (
    <div className="flex min-h-12 items-center justify-between gap-4 py-2">
      <span className="flex flex-col gap-0.5">
        <span className="text-body text-ink">This browser</span>
        <span className="text-small text-grey-700">
          {state === 'on'
            ? 'Push is on here.'
            : state === 'blocked'
              ? 'Your browser is blocking notifications. Allow them in its site settings, then come back.'
              : state === 'unsupported'
                ? 'This browser cannot show push notifications.'
                : state === 'not-configured'
                  ? 'Push is not set up on this environment yet.'
                  : anySubscribed
                    ? 'Push is on somewhere else, but not here.'
                    : 'Get a notice on this device, even when the app is closed.'}
        </span>
      </span>
      {state === 'on' ? (
        <Button variant="secondary" pending={pending} onClick={turnOff}>
          Turn off
        </Button>
      ) : state === 'off' ? (
        <Button variant="secondary" pending={pending} onClick={turnOn}>
          Turn on
        </Button>
      ) : null}
    </div>
  );
}
