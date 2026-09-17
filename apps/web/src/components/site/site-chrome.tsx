import { brand } from '@repo/config/brand';
import { Button } from '@repo/ui/button';
import { Menu } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { brandMark } from '@/lib/pwa/icon-art';
import { SiteNav, SiteNavList } from './site-nav';
import { siteNav } from './site-nav-links';

/**
 * What every page of the public site shares (PRD 8.3, M5-09): the way round the site at the top,
 * and the way to everything else at the bottom. Plain values in, so the design page can show them
 * without a database.
 */

/** The brand's mark, drawn as the app icon draws it. */
export function BrandMark({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <span className={size === 'lg' ? 'flex size-10 items-center justify-center rounded-input bg-black' : 'flex size-8 items-center justify-center rounded-input bg-black'} aria-hidden>
      <svg viewBox="0 0 100 100" className={size === 'lg' ? 'size-6' : 'size-5'}>
        <path d={brandMark} className="fill-white" fillRule="evenodd" />
      </svg>
    </span>
  );
}

export function SiteHeader({ appUrl }: { appUrl: string }) {
  return (
    <header className="border-b border-grey-200 bg-white">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-30 focus:rounded-full focus:bg-black focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-4 md:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2 text-h3 text-black">
          <BrandMark />
          {brand.name}
        </Link>
        <Suspense fallback={<SiteNavList current={null} />}>
          <SiteNav />
        </Suspense>
        <div className="ml-auto flex items-center gap-2">
          <a href={`${appUrl}/sign-in`} className="inline-flex h-12 items-center rounded-full px-3 text-small font-semibold text-ink hover:bg-grey-100">
            Sign in
          </a>
          {/* On a phone the page's own button is the one to press; the header keeps out of its way. */}
          <Button asChild className="hidden md:inline-flex">
            <a href={`${appUrl}/start`}>Get started</a>
          </Button>
          {/* A disclosure, not a script: the menu opens before the page has loaded anything else. */}
          <details className="group relative md:hidden">
            <summary
              aria-label="Menu"
              className="flex size-12 cursor-pointer list-none items-center justify-center rounded-full text-black hover:bg-grey-100 [&::-webkit-details-marker]:hidden"
            >
              <Menu size={24} strokeWidth={1.5} aria-hidden />
            </summary>
            <nav aria-label="Site pages" className="absolute top-14 right-0 z-20 w-64 rounded-card bg-white p-2 shadow-raised">
              <ul className="flex flex-col">
                {siteNav.map((link) => (
                  <li key={link.href}>
                    <a href={link.href} className="flex h-12 items-center rounded-input px-3 text-body font-semibold text-ink hover:bg-grey-100">
                      {link.label}
                    </a>
                  </li>
                ))}
                <li className="mt-1 border-t border-grey-200 pt-1">
                  <a href={`${appUrl}/start`} className="flex h-12 items-center rounded-input px-3 text-body font-semibold text-ink hover:bg-grey-100">
                    Get started
                  </a>
                </li>
              </ul>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}

interface FooterLink {
  href: string;
  label: string;
}

function FooterLinks({ title, links }: { title: string; links: readonly FooterLink[] }) {
  if (links.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-small font-semibold text-black">{title}</h2>
      <ul className="flex flex-col gap-1">
        {links.map((link) => (
          <li key={link.href}>
            <a href={link.href} className="inline-flex min-h-10 items-center text-small text-grey-700 hover:text-black hover:underline">
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SiteFooter({ appUrl, cities }: { appUrl: string; cities: readonly { slug: string; name: string }[] }) {
  return (
    <footer className="border-t border-grey-200 bg-grey-100">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 md:grid-cols-4 md:px-6">
        <div className="flex flex-col gap-3">
          <Link href="/" className="flex items-center gap-2 text-h3 text-black">
            <BrandMark />
            {brand.name}
          </Link>
          <p className="text-small text-grey-700">{brand.tagline}</p>
        </div>
        <FooterLinks title="Who it is for" links={siteNav} />
        <FooterLinks title="Driving lessons" links={cities.map((city) => ({ href: `/driving-lessons/${city.slug}`, label: `Driving lessons in ${city.name}` }))} />
        <FooterLinks
          title="Your account"
          links={[
            { href: `${appUrl}/sign-in`, label: 'Sign in' },
            { href: `${appUrl}/start`, label: 'Create an account' },
            { href: `mailto:${brand.supportEmail}`, label: 'Contact support' },
          ]}
        />
      </div>
      <p className="mx-auto w-full max-w-6xl px-4 pb-8 text-caption text-grey-700 md:px-6">
        {brand.name} is run by {brand.legalEntity}.
      </p>
    </footer>
  );
}
