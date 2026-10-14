import { sitemapIndexXml, sitemapKindsWithPages, sitemapPath } from '@repo/core/sitemap';
import { sitemapEntries, xmlResponse } from '@/lib/public/sitemap';
import { getSiteUrl } from '@/lib/site-url';

/**
 * The index of sitemaps (PRD 14.6, M5-08): one for each kind of public page that has any. robots.txt
 * points here. A kind with nothing in it yet is left out, because search reports an empty sitemap
 * as an error; it joins the index with its first page, when the entries are read fresh (D-261).
 */
export async function GET(): Promise<Response> {
  const site = getSiteUrl();
  const kinds = sitemapKindsWithPages(await sitemapEntries());
  return xmlResponse(sitemapIndexXml(kinds.map((kind) => `${site}${sitemapPath(kind)}`)));
}
