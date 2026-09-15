import { brand } from '@repo/config/brand';
import { describe, expect, it } from 'vitest';
import manifest from './manifest';

describe('the web app manifest (PRD 8.1, M4-08)', () => {
  it('names and colours the app from brand.ts, and opens it on its own screen', () => {
    expect(manifest()).toMatchObject({
      name: brand.name,
      short_name: brand.shortName,
      description: brand.tagline,
      start_url: '/start',
      scope: '/',
      display: 'standalone',
      background_color: brand.colours.white,
      theme_color: brand.colours.black,
    });
  });

  it('has the icons an installed app needs: 192 and 512 pixels, and one Android may crop', () => {
    expect(manifest().icons).toEqual([
      { src: '/icons/192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ]);
  });
});
