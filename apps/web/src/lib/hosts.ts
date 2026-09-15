import { brand } from '@repo/config/brand';

/**
 * The pages the public site serves on the bare domain: its home, and the public pages under these
 * prefixes (PRD 8.3). Everything else on it belongs to the app. Each public page adds its prefix
 * here when it arrives (M5, D-109).
 */
const siteHome = '/';
const sitePrefixes: readonly string[] = ['/instructors/'];

/** Whether a path is one of the public site's pages. */
export function isSitePath(pathname: string): boolean {
  return pathname === siteHome || sitePrefixes.some((prefix) => pathname.startsWith(prefix));
}

export interface HostRedirect {
  url: string;
  /** Moved for good, which search engines and browsers remember. */
  permanent: boolean;
}

/**
 * Where a request belongs, when it has arrived on the wrong one of the two hosts (D-084).
 *
 * The bare domain is the public site: an app address opened there moves to the app for good,
 * path and query kept, so an old link still lands, and a public page opened on the app moves to
 * the site the same way. The app's own root has nothing to show anybody, so it goes to getting
 * started, which sends somebody already signed in to their portal. Any other host, a preview
 * deployment or this machine, serves both and is left alone.
 */
export function hostRedirect(host: string | null, pathname: string, search: string): HostRedirect | null {
  const name = (host ?? '').trim().toLowerCase().replace(/:\d+$/, '');

  if (name === brand.domain || name === `www.${brand.domain}`) {
    return isSitePath(pathname) ? null : { url: `${brand.appUrl}${pathname}${search}`, permanent: true };
  }

  if (name === brand.appHost && pathname === siteHome) {
    return { url: `${brand.appUrl}/start${search}`, permanent: false };
  }

  // A public page is found by search in one place, the public site (D-109).
  if (name === brand.appHost && isSitePath(pathname)) {
    return { url: `${brand.productionUrl}${pathname}${search}`, permanent: true };
  }

  return null;
}
