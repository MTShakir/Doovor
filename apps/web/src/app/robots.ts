import { brand } from '@repo/config/brand';
import type { MetadataRoute } from 'next';

/** Outside production nothing is indexed; in production, private areas never are (D-047). */
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
    host: brand.productionUrl,
  };
}
