import { ListDivider, ListRow } from '@repo/ui/list-row';
import { PageHeader } from '@repo/ui/app-shell';
import { Card } from '@repo/ui/card';
import { Button } from '@repo/ui/button';
import type { Route } from 'next';
import Link from 'next/link';
import { signOut } from '@/app/(auth)/actions';

export interface MoreLink {
  href: string;
  title: string;
  subtitle?: string;
}

/** The "More" and "Account" tabs on phones: extra destinations plus sign out (PRD 8.2). */
export function MoreMenu({ title, links }: { title: string; links: MoreLink[] }) {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader title={title} />
      <div className="px-4 md:px-8">
        <Card padding="none" className="overflow-hidden">
          {links.map((link, index) => (
            <div key={link.href}>
              {index > 0 ? <ListDivider /> : null}
              <ListRow asChild title={link.title} subtitle={link.subtitle} chevron>
                <Link href={link.href as Route} aria-label={link.title} />
              </ListRow>
            </div>
          ))}
        </Card>
      </div>
      <form action={signOut.bind(null, 'local')} className="px-4 md:px-8">
        <Button type="submit" variant="secondary" width="responsive">
          Sign out
        </Button>
      </form>
    </main>
  );
}
