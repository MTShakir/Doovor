import { hasTags, noTags, readTags, referrerHost, withTags, type VisitTags } from '@repo/core/visits';

/**
 * Where this visit came from, held in the page's memory and nowhere else (D-413). It is read from
 * the address the visit landed on, and given to every link into the app's getting started and
 * sign-up, so an account can say where it came from. Nothing is stored on the device: a page
 * opened afresh starts again, and so does a new tab.
 */
export interface Arrival {
  /** The page the visit began on, or null when it did not begin here. */
  landing: string | null;
  /** The query it landed with, of which only the tags are read. */
  search: string;
  /** Where it came from, as the browser said. */
  referrer: string;
  /** The link's own tags. */
  tags: VisitTags;
  /** The source the server worked out when the link had no tags of its own. */
  learned: VisitTags;
}

let arrival: Arrival | null = null;

/** Our own hosts, as a referrer names them: a page of ours is not where a visit came from. */
function isOurs(host: string, ownHosts: readonly string[]): boolean {
  return ownHosts.some((own) => own.toLowerCase().replace(/^www\./, '').replace(/:\d+$/, '') === host);
}

/**
 * The visit, begun on the first page this tab has opened of ours and kept for the pages after it.
 * A visit begins only on a page opened from somewhere else: not on one reached from another page
 * of ours, nor on a page opened again.
 */
export function beginVisit(input: {
  path: string;
  search: string;
  referrer: string;
  /** How the browser came to this page: "navigate" for a link, "reload", "back_forward". */
  navigation: string | undefined;
  ownHosts: readonly string[];
}): { arrival: Arrival; entry: boolean } {
  if (arrival !== null) return { arrival, entry: false };
  const from = referrerHost(input.referrer);
  const fromUs = from !== null && isOurs(from, input.ownHosts);
  const fresh = input.navigation === undefined || input.navigation === 'navigate' || input.navigation === 'prerender';
  const entry = fresh && !fromUs;
  arrival = {
    landing: entry ? input.path : null,
    search: input.search,
    referrer: fromUs ? '' : input.referrer,
    tags: readTags(input.search),
    learned: noTags,
  };
  return { arrival, entry };
}

/** What the server worked out about where the visit came from, for a link that had no tags. */
export function learnTags(tags: VisitTags): void {
  if (arrival !== null) arrival = { ...arrival, learned: tags };
}

/** The pages of the app where somebody begins an account. */
const startingPages = new Set(['/start', '/sign-up']);

/**
 * A link into the app's getting started or sign-up, carrying where the visit came from: the link's
 * own tags, or the source the server worked out. Any other link is left as it is.
 */
export function carriedHref(href: string, appOrigin: string): string {
  if (arrival === null) return href;
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return href;
  }
  if (url.origin !== appOrigin || !startingPages.has(url.pathname)) return href;
  const tags = arrival.tags.source !== null ? arrival.tags : arrival.learned;
  return hasTags(tags) && tags.source !== null ? withTags(href, tags) : href;
}

/** For tests: a tab opened afresh. */
export function forgetVisit(): void {
  arrival = null;
}
