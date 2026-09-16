import { brand } from '@repo/config/brand';
import { instructorShareCard, shareCardVersion } from '@repo/core/share-card';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { publicPageMetadata, sharedLinkMetadata, shareImageUrl } from './metadata';

const card = instructorShareCard({
  name: 'Sarah Khan',
  qualification: 'adi',
  transmission: 'manual',
  cityName: 'Leeds',
  hourlyFromPence: 4200,
  takingBookings: true,
  photoUrl: null,
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('what search and link previews read about a public page (PRD 14.6, M5-08)', () => {
  it('lives at one address on the public site, with its share image beside it', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', brand.appUrl);
    const metadata = publicPageMetadata({
      title: 'Sarah Khan, driving instructor in Leeds',
      description: 'Calm and patient.',
      path: '/instructors/leeds/sarah-khan',
      indexable: true,
      card,
      type: 'profile',
    });
    const page = `${brand.productionUrl}/instructors/leeds/sarah-khan`;
    const image = `${page}/share.png?v=${shareCardVersion(card)}`;
    expect(metadata).toEqual({
      title: 'Sarah Khan, driving instructor in Leeds',
      description: 'Calm and patient.',
      alternates: { canonical: page },
      openGraph: {
        type: 'profile',
        siteName: brand.name,
        locale: 'en_GB',
        url: page,
        title: 'Sarah Khan, driving instructor in Leeds',
        description: 'Calm and patient.',
        images: [{ url: image, width: 1200, height: 630, alt: 'Sarah Khan. Driving instructor in Leeds.' }],
      },
      twitter: {
        card: 'summary_large_image',
        title: 'Sarah Khan, driving instructor in Leeds',
        description: 'Calm and patient.',
        images: [{ url: image, width: 1200, height: 630, alt: 'Sarah Khan. Driving instructor in Leeds.' }],
      },
    });
  });

  it('tells search engines to leave a page out while it is not to be indexed, and follow its links', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');
    expect(publicPageMetadata({ title: 'Driving lessons in Croydon, London', description: 'Nobody yet.', path: '/driving-lessons/london/croydon', indexable: false })).toMatchObject({
      alternates: { canonical: 'http://localhost:3000/driving-lessons/london/croydon' },
      robots: { index: false, follow: true },
      twitter: { card: 'summary' },
    });
  });

  it('titles the home page with the site name alone, at the site root', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', brand.appUrl);
    expect(publicPageMetadata({ title: brand.name, description: brand.tagline, path: '/', indexable: true, absoluteTitle: true })).toMatchObject({
      title: { absolute: brand.name },
      alternates: { canonical: `${brand.productionUrl}/` },
    });
    expect(shareImageUrl('/', card)).toBe(`${brand.productionUrl}/share.png?v=${shareCardVersion(card)}`);
  });

  it('lets another of the site pages share the image of the site itself', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', brand.appUrl);
    const metadata = publicPageMetadata({ title: 'Pricing', description: 'Plans.', path: '/pricing', indexable: true, card, imagePath: '/' });
    expect(JSON.stringify(metadata.openGraph)).toContain(`"url":"${brand.productionUrl}/share.png?v=${shareCardVersion(card)}"`);
    expect(metadata.alternates).toEqual({ canonical: `${brand.productionUrl}/pricing` });
  });

  it('previews a link elsewhere, such as a booking link, with the card of the page it belongs to', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', brand.appUrl);
    const preview = sharedLinkMetadata({
      title: 'Book a lesson with Sarah Khan',
      description: 'Choose a time.',
      url: `${brand.appUrl}/book/sarah-khan`,
      image: { path: '/instructors/leeds/sarah-khan', card },
    });
    expect(preview.openGraph).toMatchObject({ url: `${brand.appUrl}/book/sarah-khan`, type: 'website' });
    expect(preview.twitter).toMatchObject({ card: 'summary_large_image' });
    expect(JSON.stringify(preview.openGraph)).toContain(`${brand.productionUrl}/instructors/leeds/sarah-khan/share.png?v=`);
  });
});
