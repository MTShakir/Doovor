import { brand } from '@repo/config/brand';

/**
 * The join page's own film (D-408), hosted with the site. A new cut gets a new file name, so
 * nobody is ever sent an old one from a cache, and has to pass film.test.ts, which reads the file
 * itself: a film every browser plays, on a phone or not (D-412).
 */
export const joinFilm = {
  src: '/video/join-20261029.mp4',
  captions: '/video/join-20261029.en-GB.vtt',
  title: `${brand.name} in under four minutes`,
  length: '3:43',
} as const;
