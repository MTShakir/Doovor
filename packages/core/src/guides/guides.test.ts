import { brand } from '@repo/config/brand';
import { describe, expect, it } from 'vitest';
import { sitePagePaths } from '../sitemap.ts';
import { isValidLocalDate } from '../time/index.ts';
import {
  guideAuthor,
  guideBlocks,
  guideBySlug,
  guideDate,
  guideOutline,
  guidePath,
  guides,
  guideStructuredData,
  readingMinutes,
  relatedGuides,
  type Block,
} from './index.ts';

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

    // Every fact can be checked, and where it can be checked is the government's own page.
    expect(guide.sources.length).toBeGreaterThanOrEqual(2);
    for (const source of guide.sources) expect(source.url.startsWith('https://www.gov.uk/')).toBe(true);

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
    expect(outline[0]).toEqual({ id: 'what-making-tax-digital-for-income-tax-is', text: 'What Making Tax Digital for Income Tax is' });
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
    });
    expect((graph[1]?.mainEntity as unknown[]).length).toBe(guide.questions.length);
  });
});
