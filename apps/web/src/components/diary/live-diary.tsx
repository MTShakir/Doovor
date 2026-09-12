'use client';

import { REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';

/**
 * Keeps an open diary up to date (DIA-03, M1-23).
 *
 * The database broadcasts on a private topic per instructor when a booking changes, and a
 * policy decides who may join that topic. The message carries identifiers only; this asks
 * the server for the page again rather than patching anything from it.
 */
export function LiveDiary({ instructorIds }: { instructorIds: string[] }) {
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  const topics = instructorIds.join(',');

  useEffect(() => {
    if (topics === '') return undefined;
    const supabase = getSupabaseBrowserClient();
    const channels = topics.split(',').map((id) => supabase.channel(`diary:${id}`, { config: { private: true } }));

    // Setting the token is a round trip, and this effect can be undone before it finishes:
    // joining after that would leave a channel nobody ever leaves.
    const listening = { current: true };
    void (async () => {
      // A private topic is joined with the signed-in person's own token, which the realtime
      // connection does not have until it is told.
      await supabase.realtime.setAuth();
      if (!listening.current) return;
      // Live means every diary on the screen is live, not the first of them.
      let joined = 0;
      for (const channel of channels) {
        channel.on('broadcast', { event: 'changed' }, () => { router.refresh(); }).subscribe((status) => {
          if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
            joined += 1;
            if (joined === channels.length) setConnected(true);
          }
          if (status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR) console.error('Diary updates are not connected');
        });
      }
    })();

    return () => {
      listening.current = false;
      setConnected(false);
      for (const channel of channels) void supabase.removeChannel(channel);
    };
  }, [topics, router]);

  // Nothing to look at, but something to wait for: a test, or a later reconnecting notice,
  // needs to know whether changes made elsewhere are reaching this page.
  return <span hidden data-diary-live={connected ? 'on' : 'off'} />;
}
