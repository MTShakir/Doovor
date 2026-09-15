import { brand } from '@repo/config/brand';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSiteUrl } from './site-url';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the public site address (D-109)', () => {
  it('is the bare domain where the app has its own host', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', brand.appUrl);
    expect(getSiteUrl()).toBe(brand.productionUrl);
  });

  it('is the app itself on this machine or a preview, which serve both', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000/');
    expect(getSiteUrl()).toBe('http://localhost:3000');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_URL', 'web-git-m5.vercel.app');
    expect(getSiteUrl()).toBe('https://web-git-m5.vercel.app');
  });
});
