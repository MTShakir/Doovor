import { sitemapIndexXml, sitemapKinds, sitemapPath } from '@repo/core/sitemap';
import { xmlResponse } from '@/lib/public/sitemap';
import { getSiteUrl } from '@/lib/site-url';

/** The index of sitemaps (PRD 14.6, M5-08): one for each kind of public page. robots.txt points here. */
export function GET(): Response {
  const site = getSiteUrl();
  return xmlResponse(sitemapIndexXml(sitemapKinds.map((kind) => `${site}${sitemapPath(kind)}`)));
}
