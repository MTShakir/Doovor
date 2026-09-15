import { brand } from '@repo/config/brand';

/**
 * The paths the public site serves on the bare domain. Everything else on it belongs to the
 * app. The marketing pages add theirs here when they arrive (M5).
 */
export const sitePaths: readonly string[] = ['/'];

export interface HostRedirect {
  url: string;
  /** Moved for good, which search engines and browsers remember. */
  permanent: boolean;
}

/**
 * Where a request belongs, when it has arrived on the wrong one of the two hosts (D-084).
 *
 * The bare domain is the public site: an app address opened there moves to the app for good,
 * path and query kept, so an old link still lands. The app's own root has nothing to show
 * anybody, so it goes to getting started, which sends somebody already signed in to their
 * portal. Any other host, a preview deployment or this machine, is left alone.
 */
export function hostRedirect(host: string | null, pathname: string, search: string): HostRedirect | null {
  const name = (host ?? '').trim().toLowerCase().replace(/:\d+$/, '');

  if (name === brand.domain || name === `www.${brand.domain}`) {
    return sitePaths.includes(pathname) ? null : { url: `${brand.appUrl}${pathname}${search}`, permanent: true };
  }

  if (name === brand.appHost && pathname === '/') {
    return { url: `${brand.appUrl}/start${search}`, permanent: false };
  }

  return null;
}
