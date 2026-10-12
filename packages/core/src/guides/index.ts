/**
 * The guides on the public site (PRD 8.3, 14.6, D-255): articles that answer what learners and
 * instructors search for, written as typed data in this package so they are checked like code,
 * read by the same tests as everything else, and drawn by the site in its own components.
 *
 * A guide is written by "The [brand] team", says when it was last checked, and lists the GOV.UK
 * pages its facts come from. Search is given each one as an Article, with its questions as an
 * FAQ and its place on the site as breadcrumbs.
 */

import { brand } from '@repo/config/brand';
import { guideShareCard, type ShareCard } from '../share-card.ts';
import { breadcrumbList, type JsonLd } from '../structured-data.ts';
import { formatCalendarDate } from '../time/index.ts';
import { drivingInstructorExpenses } from './library/driving-instructor-expenses.ts';
import { drivingTestBookingRules2026 } from './library/driving-test-booking-rules-2026.ts';
import { makingTaxDigitalForDrivingInstructors } from './library/making-tax-digital-for-driving-instructors.ts';
import { parseGuideMarkdown, wordCount, type Block } from './markdown.ts';
import type { Guide, GuideAudience } from './types.ts';

export type { Block, Inline } from './markdown.ts';
export { parseGuideMarkdown, wordCount } from './markdown.ts';
export type { Guide, GuideAudience, GuideQuestion, GuideSource } from './types.ts';

/** Every guide, newest first. A new one is written in `library` and added here. */
export const guides: readonly Guide[] = [makingTaxDigitalForDrivingInstructors, drivingInstructorExpenses, drivingTestBookingRules2026];

export const guidesPath = '/guides';

export function guidePath(slug: string): string {
  return `${guidesPath}/${slug}`;
}

export function guideBySlug(slug: string): Guide | undefined {
  return guides.find((guide) => guide.slug === slug);
}

/** Who writes them: the team, not a person, until a person writes one. */
export const guideAuthor = `The ${brand.name} team`;

export const audienceLabels: Record<GuideAudience, string> = {
  learners: 'For learners',
  instructors: 'For instructors',
  schools: 'For driving schools',
};

/** The audiences in the order the guides page lists them: the people who pay first. */
export const audienceOrder: readonly GuideAudience[] = ['instructors', 'schools', 'learners'];

export function guideBlocks(guide: Guide): Block[] {
  return parseGuideMarkdown(guide.body);
}

/** Minutes to read, at 200 words a minute, and never less than one. */
export function readingMinutes(guide: Guide): number {
  return Math.max(1, Math.round(wordCount(guideBlocks(guide)) / 200));
}

/** The page's own contents: its main headings, each with its address on the page. */
export function guideOutline(blocks: readonly Block[]): { id: string; text: string }[] {
  return blocks.flatMap((block) => (block.kind === 'heading' && block.level === 2 ? [{ id: block.id, text: block.text }] : []));
}

export function relatedGuides(guide: Guide): Guide[] {
  return guide.related.flatMap((slug) => {
    const found = guideBySlug(slug);
    return found === undefined ? [] : [found];
  });
}

/** "Tue 13 Oct 2026", as every date on the site is written. */
export function guideDate(date: string): string {
  return formatCalendarDate(date, { year: true });
}

/** The picture a shared link to a guide shows. */
export function guideCard(guide: Guide): ShareCard {
  return guideShareCard({ audience: audienceLabels[guide.audience], title: guide.title, minutes: readingMinutes(guide), updated: guideDate(guide.updated) });
}

/**
 * What search is told about a guide (PRD 14.6): the Article, its questions as an FAQ, and where it
 * sits on the site. Everything in it is on the page as well; nothing is added for machines.
 */
export function guideStructuredData(guide: Guide, site: { url: string; imageUrl: string }): JsonLd {
  const url = `${site.url}${guidePath(guide.slug)}`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: guide.title,
        description: guide.description,
        image: site.imageUrl,
        datePublished: guide.published,
        dateModified: guide.updated,
        author: { '@type': 'Organization', name: guideAuthor, url: site.url },
        publisher: { '@type': 'Organization', name: brand.name, url: site.url, logo: { '@type': 'ImageObject', url: `${site.url}/icons/512.png` } },
        mainEntityOfPage: url,
        inLanguage: 'en-GB',
      },
      {
        '@type': 'FAQPage',
        mainEntity: guide.questions.map((one) => ({
          '@type': 'Question',
          name: one.question,
          acceptedAnswer: { '@type': 'Answer', text: one.answer },
        })),
      },
      breadcrumbList([
        { name: brand.name, url: site.url },
        { name: 'Guides', url: `${site.url}${guidesPath}` },
        { name: guide.title, url },
      ]),
    ],
  };
}
