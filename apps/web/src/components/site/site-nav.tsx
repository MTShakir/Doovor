'use client';

import { cn } from '@repo/ui/lib/cn';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { siteNav } from './site-nav-links';

/** The site's own pages across the header on a wide screen, the one being read, if any, marked as current. */
export function SiteNavList({ current }: { current: string | null }) {
  return (
    <nav aria-label="Main" className="hidden md:block">
      <ul className="flex items-center gap-1">
        {siteNav.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              aria-current={current === link.href ? 'page' : undefined}
              className={cn(
                'inline-flex h-12 items-center rounded-full px-3 text-small font-semibold text-ink hover:bg-grey-100',
                current === link.href && 'bg-grey-100 text-black',
              )}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Reads the address, so on a page whose address is only known when it is asked for it waits behind the plain list. */
export function SiteNav() {
  return <SiteNavList current={usePathname()} />;
}
