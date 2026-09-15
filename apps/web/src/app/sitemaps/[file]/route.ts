import { isSitemapKind, sitemapPaths, urlSetXml } from '@repo/core/sitemap';
import { sitemapEntries, xmlResponse } from '@/lib/public/sitemap';
import { getSiteUrl } from '@/lib/site-url';

/**
 * One kind of public page (PRD 14.6, M5-08): /sitemaps/instructors.xml and the like, listing only
 * the pages search may show, each at its one address. Any other name is not found.
 */
export async function GET(_request: Request, { params }: RouteContext<'/sitemaps/[file]'>): Promise<Response> {
  const { file } = await params;
  const kind = file.endsWith('.xml') ? file.slice(0, -'.xml'.length) : '';
  if (!isSitemapKind(kind)) return new Response(null, { status: 404 });

  const site = getSiteUrl();
  const paths = sitemapPaths(kind, await sitemapEntries());
  return xmlResponse(urlSetXml(paths.map((path) => `${site}${path}`)));
}
