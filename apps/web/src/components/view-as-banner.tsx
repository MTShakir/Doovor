import { Button } from '@repo/ui/button';
import { Eye } from 'lucide-react';
import { stopViewingAs } from '@/app/(admin)/admin/view-as-actions';

/**
 * ADM-06: on every screen while platform staff view as somebody, so nobody forgets whose screens
 * these are, with the one way back (D-129).
 */
export function ViewAsBanner({ name, endsAt }: { name: string; endsAt: string }) {
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-2 bg-yellow px-4 py-2 text-black md:px-8">
      <p className="flex items-center gap-2 text-small font-semibold">
        <Eye className="size-4 shrink-0" aria-hidden />
        Viewing as {name}, read only, until {endsAt}
      </p>
      <form action={stopViewingAs}>
        <Button type="submit" variant="primary" size="md">
          Stop viewing
        </Button>
      </form>
    </div>
  );
}
