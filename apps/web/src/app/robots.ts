import { brand } from '@repo/config/brand';
import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/site-url';

/**
 * Outside production nothing is indexed; in production, private areas never are (D-047), and
 * search engines are given the index of sitemaps (PRD 14.6, M5-08).
 */
export default function robots(): MetadataRoute.Robots {
  if (process.env.APP_ENV !== 'production') {
    return { rules: { userAgent: '*', disallow: '/' } };
  }
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/app/', '/admin/', '/account', '/auth/', '/api/', '/mfa', '/verify-phone', '/design'],
    },
    sitemap: `${getSiteUrl()}/sitemap.xml`,
    host: brand.productionUrl,
  };
}
