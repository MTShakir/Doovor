import { brand } from '@repo/config/brand';
import type { MetadataRoute } from 'next';
import { appIcons } from '@/lib/pwa/icons';

/**
 * The app as a phone or a computer installs it (PRD 8.1, M4-08): its name, colours and icons from
 * brand.ts. It opens on getting started, which sends somebody signed in straight to their portal.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: brand.name,
    short_name: brand.shortName,
    description: brand.tagline,
    lang: 'en-GB',
    dir: 'ltr',
    start_url: '/start',
    scope: '/',
    display: 'standalone',
    background_color: brand.colours.white,
    theme_color: brand.colours.black,
    categories: ['education', 'productivity'],
    icons: appIcons
      .filter((icon) => !icon.file.startsWith('apple-'))
      .map((icon) => ({
        src: `/icons/${icon.file}`,
        sizes: `${String(icon.size)}x${String(icon.size)}`,
        type: 'image/png',
        purpose: icon.purpose,
      })),
  };
}
