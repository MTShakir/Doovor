import { Button } from '@repo/ui/button';
import { EmptyState } from '@repo/ui/empty-state';
import { MapPinOff } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

/** Named in the tab and in history for what it is, as a place that does not exist already is (D-364). */
export const metadata: Metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center">
      <EmptyState
        headingLevel={1}
        icon={MapPinOff}
        title="Page not found"
        description="The link may be old or mistyped."
        action={
          <Button asChild width="full">
            <Link href="/">Go to the home page</Link>
          </Button>
        }
      />
    </main>
  );
}
