import { brand } from '@repo/config/brand';
import { describe, expect, it } from 'vitest';
import { sitePagePaths } from '../sitemap.ts';
import { isValidLocalDate } from '../time/index.ts';
import {
  guideAuthor,
  guideBlocks,
  guideBySlug,
  guideDate,
  guideGeoTags,
  guideImageKeys,
  guideOutline,
  guidePath,
  guidePictures,
  guides,
  guideStructuredData,
  readingMinutes,
  relatedGuides,
  type Block,
  type Guide,
} from './index.ts';
import { cardFeePence, comparisonSlug, pencePerLesson } from './library/apps-compared.ts';

function links(blocks: readonly Block[]): string[] {
  return blocks.flatMap((block) => {
    const lines =
      block.kind === 'paragraph' || block.kind === 'note'
        ? [block.content]
        : block.kind === 'list'
          ? block.items
          : block.kind === 'table'
            ? [...block.header, ...block.rows.flat()]
            : [];
    return lines.flat().flatMap((piece) => (piece.kind === 'link' ? [piece.href] : []));
  });
}

/** Where a guide may send somebody on our own site: a page that exists. */
const ownPages = new Set([...sitePagePaths, ...guides.map((guide) => guidePath(guide.slug))]);

/** Every word a reader reads in a guide, in one string, to look for a phrase in. */
function readText(guide: Guide): string {
  const inline = (content: readonly { text: string }[]) => content.map((piece) => piece.text).join('');
  return [
    guide.title,
    guide.summary,
    ...guide.takeaways,
    ...guide.questions.flatMap((one) => [one.question, one.answer]),
    ...guideBlocks(guide).map((block) => {
      switch (block.kind) {
        case 'heading':
          return block.text;
        case 'paragraph':
        case 'note':
          return inline(block.content);
        case 'list':
          return block.items.map(inline).join(' ');
        case 'table':
          return [...block.header, ...block.rows.flat()].map(inline).join(' ');
        case 'image':
          return block.caption;
      }
    }),
  ]
    .join(' ')
    .toLowerCase();
}

describe('every guide is written to the same rules (D-255)', () => {
  it.each(guides)('$slug', (guide) => {
    expect(guide.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(guide.title.length).toBeGreaterThanOrEqual(20);
    expect(guide.title.length).toBeLessThanOrEqual(110);
    // What search shows under the title, cut off past about 160 characters.
    expect(guide.description.length).toBeGreaterThanOrEqual(70);
    expect(guide.description.length).toBeLessThanOrEqual(160);
    expect(guide.summary.length).toBeGreaterThan(40);
    expect(isValidLocalDate(guide.published)).toBe(true);
    expect(isValidLocalDate(guide.updated)).toBe(true);
    expect(guide.updated >= guide.published).toBe(true);

    const blocks = guideBlocks(guide);
    expect(guideOutline(blocks).length).toBeGreaterThanOrEqual(3);
    expect(readingMinutes(guide)).toBeGreaterThanOrEqual(3);

    expect(guide.questions.length).toBeGreaterThanOrEqual(3);
    for (const one of guide.questions) expect(one.question.endsWith('?')).toBe(true);

    // Every fact can be checked: the government's on its own pages, a company's on its own (D-387).
    expect(guide.sources.length).toBeGreaterThanOrEqual(2);
    for (const source of guide.sources) expect(source.url.startsWith('https://')).toBe(true);
    expect(guide.sources.some((source) => source.url.startsWith('https://www.gov.uk/'))).toBe(true);
    expect(new Set(guide.sources.map((source) => source.url)).size).toBe(guide.sources.length);

    // The answer first, a sentence at a time, for people and assistants alike (D-387).
    expect(guide.takeaways.length).toBeGreaterThanOrEqual(3);
    expect(guide.takeaways.length).toBeLessThanOrEqual(5);
    for (const takeaway of guide.takeaways) {
      expect(takeaway.endsWith('.')).toBe(true);
      expect(takeaway.length).toBeLessThanOrEqual(260);
    }

    // The phrase it is written for is in its title and its words; the rest are on the page too.
    expect(guide.keywords.length).toBeGreaterThanOrEqual(4);
    expect(new Set(guide.keywords.map((keyword) => keyword.toLowerCase())).size).toBe(guide.keywords.length);
    const [phrase = ''] = guide.keywords;
    expect(guide.title.toLowerCase()).toContain(phrase.toLowerCase());
    const text = readText(guide);
    for (const keyword of guide.keywords) expect(text, keyword).toContain(keyword.toLowerCase());

    // Where it applies, as tags and geo tags: a real region, and a point inside the UK.
    expect(guide.places.length).toBeGreaterThanOrEqual(1);
    for (const place of guide.places) {
      expect(place.region).toMatch(/^GB(-[A-Z]{3})?$/);
      if (place.point) {
        expect(place.point.latitude).toBeGreaterThan(49.8);
        expect(place.point.latitude).toBeLessThan(60.9);
        expect(place.point.longitude).toBeGreaterThan(-8.7);
        expect(place.point.longitude).toBeLessThan(1.8);
      }
    }

    // At least one picture of the app, each with words for somebody who cannot see it.
    const pictures = guidePictures(blocks);
    expect(pictures.length).toBeGreaterThanOrEqual(1);
    for (const picture of pictures) {
      expect(picture.alt.length).toBeGreaterThan(20);
      expect(picture.caption.endsWith('.')).toBe(true);
    }

    for (const slug of guide.related) {
      expect(slug).not.toBe(guide.slug);
      expect(guideBySlug(slug)).toBeDefined();
    }
    for (const href of links(blocks).filter((one) => one.startsWith('/'))) expect(ownPages.has(href)).toBe(true);
  });

  it('gives every guide its own address', () => {
    expect(new Set(guides.map((guide) => guide.slug)).size).toBe(guides.length);
    expect(guidePath('driving-instructor-expenses')).toBe('/guides/driving-instructor-expenses');
    expect(guideBySlug('nowhere')).toBeUndefined();
  });

  it('writes each guide for a phrase of its own, so two guides never compete for one', () => {
    const phrases = guides.map((guide) => (guide.keywords[0] ?? '').toLowerCase());
    expect(new Set(phrases).size).toBe(guides.length);
  });

  it('shows every picture of the app somewhere, so none is kept for nothing', () => {
    const shown = new Set(guides.flatMap((guide) => guidePictures(guideBlocks(guide)).map((picture) => picture.key)));
    expect([...shown].sort()).toEqual([...guideImageKeys].sort());
  });
});

describe('what the comparisons are worked out from (D-387)', () => {
  it('is the standard UK card fee on a lesson, and a month over about a hundred lessons', () => {
    expect(cardFeePence(3800)).toBe(77);
    expect(cardFeePence(4200)).toBe(83);
    expect(pencePerLesson(1200)).toBe(11);
    expect(pencePerLesson(2600)).toBe(24);
  });

  it('gives the comparison an address that carries the brand from brand.ts', () => {
    expect(comparisonSlug).toBe(`total-drive-vs-mydrivetime-vs-${brand.name.toLowerCase()}`);
    expect(guideBySlug(comparisonSlug)?.title).toContain(brand.name);
  });
});

describe('what a guide page shows and tells search (D-255)', () => {
  const guide = guides[0];
  if (guide === undefined) throw new Error('There is no guide to read');

  it('is written by the team, dated the way the site writes dates, and points to what to read next', () => {
    expect(guideAuthor).toBe(`The ${brand.name} team`);
    expect(guideDate('2026-10-13')).toBe('Tue 13 Oct 2026');
    expect(relatedGuides(guide).map((one) => one.slug)).toEqual(guide.related);
  });

  it('outlines its main headings, each with its address on the page', () => {
    const outline = guideOutline(guideBlocks(guide));
    expect(outline[0]).toEqual({ id: 'what-driving-instructor-software-does', text: 'What driving instructor software does' });
  });

  it('is an Article, an FAQ of its questions, and a step in the breadcrumbs', () => {
    const data = guideStructuredData(guide, { url: 'https://example.com', imageUrl: 'https://example.com/share.png' });
    const graph = data['@graph'] as Record<string, unknown>[];
    expect(graph.map((node) => node['@type'])).toEqual(['Article', 'FAQPage', 'BreadcrumbList']);
    expect(graph[0]).toMatchObject({
      headline: guide.title,
      datePublished: guide.published,
      dateModified: guide.updated,
      author: { name: guideAuthor },
      mainEntityOfPage: `https://example.com${guidePath(guide.slug)}`,
      image: 'https://example.com/share.png',
    });
    expect((graph[1]?.mainEntity as unknown[]).length).toBe(guide.questions.length);
  });

  it('tells search its short answers, the phrases it answers, where it applies and the pictures it shows (D-387)', () => {
    const local = guideBySlug('sidcup-belvedere-erith-driving-test-centres');
    if (local === undefined) throw new Error('There is no local guide');
    const data = guideStructuredData(local, {
      url: 'https://example.com',
      imageUrl: 'https://example.com/share.png',
      pictureUrls: ['https://example.com/today.webp'],
    });
    const article = (data['@graph'] as Record<string, unknown>[])[0];
    expect(article).toMatchObject({
      abstract: local.takeaways.join(' '),
      keywords: local.keywords.join(', '),
      image: ['https://example.com/share.png', 'https://example.com/today.webp'],
    });
    expect(article?.wordCount).toBeGreaterThan(600);
    expect((article?.spatialCoverage as unknown[])[0]).toEqual({
      '@type': 'Place',
      name: 'London Borough of Bexley',
      geo: { '@type': 'GeoCoordinates', latitude: 51.45, longitude: 0.15 },
    });
    const country = guideStructuredData(guide, { url: 'https://example.com', imageUrl: 'https://example.com/share.png' });
    expect(((country['@graph'] as Record<string, unknown>[])[0]?.spatialCoverage as unknown[])[0]).toEqual({ '@type': 'Place', name: 'United Kingdom' });
  });

  it('gives a town its geo tags with where it is, a country its region alone, and nowhere none at all (D-387)', () => {
    const local = guideBySlug('sidcup-belvedere-erith-driving-test-centres');
    if (local === undefined) throw new Error('There is no local guide');
    expect(guideGeoTags(local)).toEqual({
      'geo.region': 'GB-BEX',
      'geo.placename': 'London Borough of Bexley',
      'geo.position': '51.45;0.15',
      ICBM: '51.45, 0.15',
    });
    expect(guideGeoTags(guide)).toEqual({ 'geo.region': 'GB', 'geo.placename': 'United Kingdom' });
    expect(guideGeoTags({ ...guide, places: [] })).toEqual({});
  });

  it('lists the pictures of the app it shows, in order', () => {
    expect(guidePictures(guideBlocks(guide)).map((picture) => picture.key)).toEqual([
      'booking-page',
      'learner-pay',
      'lesson-record',
      'diary-week',
      'booking-link',
    ]);
  });
});
