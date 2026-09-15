import { brand } from '@repo/config/brand';
import { afterEach, describe, expect, it, vi } from 'vitest';
import robots from './robots';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('robots.txt (D-047, PRD 14.6)', () => {
  it('keeps everything out of search outside production, and names no sitemap there', () => {
    vi.stubEnv('APP_ENV', 'preview');
    expect(robots()).toEqual({ rules: { userAgent: '*', disallow: '/' } });
  });

  it('in production, keeps private areas out and gives search engines the index of sitemaps on the public site', () => {
    vi.stubEnv('APP_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', brand.appUrl);
    expect(robots()).toEqual({
      rules: {
        userAgent: '*',
        allow: '/',
        disallow: ['/app/', '/admin/', '/account', '/auth/', '/api/', '/mfa', '/verify-phone', '/design'],
      },
      sitemap: `${brand.productionUrl}/sitemap.xml`,
      host: brand.productionUrl,
    });
  });
});
