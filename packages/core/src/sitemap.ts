/**
 * Sitemaps by type (PRD 14.6, M5-08): an index at /sitemap.xml, and one sitemap for each kind of
 * public page, listing only what search may show.
 *
 * What is listed comes from `sitemap_entries` in the database, which applies the search rule
 * (D-113). The words here decide the addresses, and leave out places too thin to index, with the
 * same threshold the pages use (PRD 8.3).
 */

import { isThinPlace, placePagePath } from './places.ts';
import { instructorProfilePath, schoolProfilePath } from './public-profile.ts';

export const sitemapKinds = ['pages', 'instructors', 'schools', 'places'] as const;

export type SitemapKind = (typeof sitemapKinds)[number];

/** Search engines read at most this many addresses from one sitemap (sitemaps.org). */
export const SITEMAP_URL_LIMIT = 50_000;

export function isSitemapKind(value: string): value is SitemapKind {
  return (sitemapKinds as readonly string[]).includes(value);
}

/** Where a kind's sitemap lives: /sitemaps/instructors.xml. */
export function sitemapPath(kind: SitemapKind): string {
  return `/sitemaps/${kind}.xml`;
}

/** The public site's own pages, besides profiles and places. The marketing pages join them in M5-09. */
export const sitePagePaths: readonly string[] = ['/'];

export interface SitemapEntries {
  instructors: readonly { slug: string; citySlug: string | null }[];
  schools: readonly { slug: string; citySlug: string | null }[];
  places: readonly { citySlug: string; areaSlug: string | null; automatic: boolean; instructorCount: number }[];
}

/** The paths one sitemap lists, each page at its one address. */
export function sitemapPaths(kind: SitemapKind, entries: SitemapEntries): string[] {
  switch (kind) {
    case 'pages':
      return [...sitePagePaths];
    case 'instructors':
      return entries.instructors.map((one) => instructorProfilePath(one.citySlug, one.slug));
    case 'schools':
      return entries.schools.map((one) => schoolProfilePath(one.citySlug, one.slug));
    case 'places':
      return entries.places
        .filter((one) => !isThinPlace(one.instructorCount))
        .map((one) =>
          placePagePath({ citySlug: one.citySlug, area: one.areaSlug === null ? null : { slug: one.areaSlug }, automatic: one.automatic }),
        );
  }
}

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>\n';
const SITEMAP_NAMESPACE = 'http://www.sitemaps.org/schemas/sitemap/0.9';

function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot', "'": 'apos' }[character] ?? ''};`);
}

/**
 * A sitemap of whole addresses. More than search engines read from one file is refused: the index
 * would need to list the kind in parts, and silently dropping pages would hide them from search.
 */
export function urlSetXml(urls: readonly string[]): string {
  if (urls.length > SITEMAP_URL_LIMIT) {
    throw new RangeError(`A sitemap holds at most ${String(SITEMAP_URL_LIMIT)} addresses, and this one has ${String(urls.length)}`);
  }
  const lines = urls.map((url) => `<url><loc>${escapeXml(url)}</loc></url>\n`).join('');
  return `${XML_DECLARATION}<urlset xmlns="${SITEMAP_NAMESPACE}">\n${lines}</urlset>\n`;
}

/** The index of sitemaps, which is what robots.txt and search consoles are given. */
export function sitemapIndexXml(urls: readonly string[]): string {
  const lines = urls.map((url) => `<sitemap><loc>${escapeXml(url)}</loc></sitemap>\n`).join('');
  return `${XML_DECLARATION}<sitemapindex xmlns="${SITEMAP_NAMESPACE}">\n${lines}</sitemapindex>\n`;
}
