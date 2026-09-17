import { countOf } from '@repo/core/counts';
import { Button } from '@repo/ui/button';
import { Card } from '@repo/ui/card';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { Skeleton, SkeletonRow } from '@repo/ui/skeleton';

/** How many an admin search lists at most: the newest, when there are more (ADM-02). */
export const ADMIN_SEARCH_LIMIT = 25;

/** A plain form, so a search is an address staff can go back to or share (ADM-02). */
export function AdminSearch({ action, label, hint, query }: { action: string; label: string; hint: string; query: string }) {
  return (
    <form role="search" action={action} method="get" className="flex items-end gap-2">
      <Field label={label} hint={hint} className="flex-1">
        <Input name="q" type="search" defaultValue={query} maxLength={100} autoComplete="off" />
      </Field>
      <Button type="submit" variant="secondary">
        Search
      </Button>
    </form>
  );
}

/** What a search found, in words: "The newest learners", "3 learners found". */
export function foundWords(count: number, query: string, one: string, many: string): string {
  if (query === '') return `The newest ${many}`;
  if (count === ADMIN_SEARCH_LIMIT) return `The newest ${String(ADMIN_SEARCH_LIMIT)} found. Type more to narrow it down.`;
  return `${countOf(count, one, many)} found`;
}

/** While a search runs: the form and a few rows, so nothing jumps when they arrive. */
export function AdminSearchSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <Skeleton className="h-20 w-full" />
      <Card padding="none">
        {Array.from({ length: 4 }, (_, index) => (
          <SkeletonRow key={index} />
        ))}
      </Card>
    </div>
  );
}
