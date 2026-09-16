import { brand } from '@repo/config/brand';
import { SHARE_IMAGE_SIZE, shareCardVersion, type ShareCard } from '@repo/core/share-card';
import type { Metadata } from 'next';
import { getSiteUrl } from '@/lib/site-url';

/**
 * What search and link previews read about a public page (PRD 14.6, M5-08): its title and words,
 * the one address it lives at, whether it is to be indexed, and the image a shared link shows.
 * Every address is whole, on the public site, whichever host is serving (D-109).
 */

/** Where a page's share image is drawn: beside the page, with the card's version in its address. */
export function shareImageUrl(path: string, card: ShareCard): string {
  return `${getSiteUrl()}${path === '/' ? '' : path}/share.png?v=${shareCardVersion(card)}`;
}

export interface SharedLink {
  title: string;
  description: string;
  /** Where the link goes. */
  url: string;
  /** The page whose card is drawn, and the card. */
  image?: { path: string; card: ShareCard };
  type?: 'website' | 'profile';
}

/** The Open Graph and card tags a link preview reads. */
export function sharedLinkMetadata({ title, description, url, image, type = 'website' }: SharedLink): Pick<Metadata, 'openGraph' | 'twitter'> {
  const images =
    image === undefined
      ? undefined
      : [{ url: shareImageUrl(image.path, image.card), ...SHARE_IMAGE_SIZE, alt: `${image.card.title}. ${image.card.eyebrow}.` }];
  return {
    openGraph: { type, siteName: brand.name, locale: 'en_GB', url, title, description, ...(images ? { images } : {}) },
    twitter: { card: images ? 'summary_large_image' : 'summary', title, description, ...(images ? { images } : {}) },
  };
}

export interface PublicPage {
  /** As search shows it; the site's name is added after it, unless this is the site's own name. */
  title: string;
  description: string;
  /** The page's one address on the public site. */
  path: string;
  /** Out of search while false: still there for anybody with the link. */
  indexable: boolean;
  card?: ShareCard;
  /** Where the card is drawn, when it is not beside the page: the site's own pages share one. */
  imagePath?: string;
  type?: 'website' | 'profile';
  /** The home page is titled with the site's name alone. */
  absoluteTitle?: boolean;
}

export function publicPageMetadata({ title, description, path, indexable, card, imagePath, type, absoluteTitle = false }: PublicPage): Metadata {
  const url = `${getSiteUrl()}${path}`;
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: url },
    ...sharedLinkMetadata({
      title,
      description,
      url,
      ...(card === undefined ? {} : { image: { path: imagePath ?? path, card } }),
      ...(type === undefined ? {} : { type }),
    }),
    ...(indexable ? {} : { robots: { index: false, follow: true } }),
  };
}
