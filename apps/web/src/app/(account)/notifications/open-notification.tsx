'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { useTransition } from 'react';
import { markRead } from './actions';

/** Opening a notification is reading it, so it stops counting as waiting (NTF-01). */
export function OpenNotification({ id, href, unread }: { id: string; href: string; unread: boolean }) {
  const [, startTransition] = useTransition();

  return (
    <Link
      href={href as Route}
      className="shrink-0 self-center rounded-input px-2 py-1 text-small font-semibold text-blue underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
      onClick={() => {
        if (!unread) return;
        startTransition(async () => {
          await markRead({ id });
        });
      }}
    >
      Open
    </Link>
  );
}
