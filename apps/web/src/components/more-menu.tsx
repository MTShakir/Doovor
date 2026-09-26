import { brand } from '@repo/config/brand';
import { ListDivider, ListRow } from '@repo/ui/list-row';
import { PageHeader } from '@repo/ui/app-shell';
import { Card } from '@repo/ui/card';
import { Button } from '@repo/ui/button';
import type { Route } from 'next';
import Link from 'next/link';
import { signOut } from '@/app/(auth)/actions';
import { ProTag } from './pro';
import { OutsideTheApp } from './pwa/install-help';

export interface MoreLink {
  href: string;
  title: string;
  subtitle?: string;
  /** Part of Pro, so it carries the tag (D-209). */
  pro?: boolean;
  /**
   * Part of Pro on a plan that does not have it. The row is still here and still opens, because
   * somebody deciding whether to pay needs to see what they would get; the screen it opens says
   * what the feature is and offers the plan.
   */
  locked?: boolean;
  /** Left out inside the installed app. Put it last: a row that is left out takes its divider with it. */
  browserOnly?: boolean;
}

/**
 * The way to put the app on the home screen, in every menu outside the installed app. The card on
 * Today, Home and Overview goes once somebody says not now; this stays (PRD 8.1, D-160).
 */
export const installAppLink: MoreLink = {
  href: '/account/install',
  title: 'Install the app',
  subtitle: `Put ${brand.shortName} on your home screen`,
  browserOnly: true,
};

/** The "More" and "Account" tabs on phones: extra destinations plus sign out (PRD 8.2). */
export function MoreMenu({ title, links }: { title: string; links: MoreLink[] }) {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader title={title} />
      <div className="px-4 md:px-8">
        <Card padding="none" className="overflow-hidden">
          {links.map((link, index) => {
            const row = (
              <div key={link.href}>
                {index > 0 ? <ListDivider /> : null}
                <ListRow
                  asChild
                  // Greyed with grey-700 rather than dimmed: a faded row is a row somebody with
                  // ordinary eyesight cannot read (D-009).
                  title={link.locked ? <span className="text-grey-700">{link.title}</span> : link.title}
                  subtitle={link.subtitle}
                  trailing={link.pro ? <ProTag muted={link.locked} /> : undefined}
                  chevron
                >
                  <Link
                    href={link.href as Route}
                    aria-label={link.locked ? `${link.title}, part of Pro` : link.title}
                  />
                </ListRow>
              </div>
            );
            return link.browserOnly ? <OutsideTheApp key={link.href}>{row}</OutsideTheApp> : row;
          })}
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
