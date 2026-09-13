import { formatDateTime } from '@repo/core/time';
import { Button } from '@repo/ui/button';
import { Card } from '@repo/ui/card';
import { EmptyState } from '@repo/ui/empty-state';
import { ListDivider } from '@repo/ui/list-row';
import { SkeletonRow } from '@repo/ui/skeleton';
import { BellOff, ChevronLeft, Settings } from 'lucide-react';
import type { Metadata, Route } from 'next';
import { connection } from 'next/server';
import Link from 'next/link';
import { Fragment, Suspense } from 'react';
import { landingPath } from '@/lib/auth/portals';
import { requireAccess } from '@/lib/auth/session';
import { myNotifications } from '@/lib/notifications/inbox';
import { MarkAllRead } from './mark-all-read';
import { OpenNotification } from './open-notification';

export const metadata: Metadata = { title: 'Notifications', robots: { index: false } };

export default function NotificationsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-2 pt-8" aria-busy>
          <SkeletonRow />
          <SkeletonRow />
        </div>
      }
    >
      <Inbox />
    </Suspense>
  );
}

/** NTF-01: what somebody has been told, in one place, wherever they were when it happened. */
async function Inbox() {
  // One person's own inbox, which a prerendered shell cannot know.
  await connection();
  const { access } = await requireAccess();
  const items = await myNotifications();
  const unread = items.filter((item) => item.readAt === null).length;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={landingPath(access) as Route}
        className="-ml-3 flex h-12 w-fit items-center gap-1 rounded-full px-3 text-body font-medium text-ink hover:bg-grey-100"
      >
        <ChevronLeft size={20} strokeWidth={1.5} aria-hidden />
        Back
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h1 text-black">Notifications</h1>
        <div className="flex items-center gap-2">
          {unread > 0 ? <MarkAllRead count={unread} /> : null}
          <Button asChild variant="secondary">
            <Link href="/notifications/settings">
              <Settings className="size-5" aria-hidden />
              Settings
            </Link>
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={BellOff}
            title="Nothing yet"
            description="Lessons booked, moved or called off will show up here."
          />
        </Card>
      ) : (
        <Card padding="none" role="region" aria-label="Your notifications">
          {items.map((item, index) => (
            <Fragment key={item.id}>
              {index === 0 ? null : <ListDivider />}
              <article className="flex items-start gap-3 px-4 py-3">
                <span
                  className={`mt-2 size-2 shrink-0 rounded-full ${item.readAt === null ? 'bg-black' : 'bg-transparent'}`}
                  aria-hidden
                />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-body font-semibold text-black">
                    {item.title}
                    {item.readAt === null ? <span className="sr-only"> (unread)</span> : null}
                  </span>
                  <span className="text-small text-grey-700">{item.body}</span>
                  <span className="text-caption text-grey-700">{formatDateTime(new Date(item.createdAt))}</span>
                </span>
                {item.link === null ? null : (
                  <OpenNotification id={item.id} href={item.link} unread={item.readAt === null} />
                )}
              </article>
            </Fragment>
          ))}
        </Card>
      )}
    </div>
  );
}
