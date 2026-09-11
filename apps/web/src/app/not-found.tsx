import { Button } from '@repo/ui/button';
import { EmptyState } from '@repo/ui/empty-state';
import { MapPinOff } from 'lucide-react';
import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center">
      <EmptyState
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
