/**
 * The guides on the public site (PRD 8.3, 14.6, D-255): articles that answer what learners and
 * instructors search for, written as typed data in this package so they are checked like code,
 * read by the same tests as everything else, and drawn by the site in its own components.
 *
 * A guide is written by "The [brand] team", says when it was last checked, and lists the pages
 * its facts come from: GOV.UK for the government's rules and figures, and a company's own pages for
 * what it sells (D-387). Search is given each one as an Article, with its questions as an FAQ and
 * its place on the site as breadcrumbs; the page opens with its short answers, for the people and
 * the assistants who want the answer first.
 */

import { brand } from '@repo/config/brand';
import { guideShareCard, type ShareCard } from '../share-card.ts';
import { brandOrganization, breadcrumbList, type JsonLd } from '../structured-data.ts';
import { formatCalendarDate } from '../time/index.ts';
import { drivingInstructorExpenses } from './library/driving-instructor-expenses.ts';
import { drivingTestBookingRules2026 } from './library/driving-test-booking-rules-2026.ts';
import { howToChooseDrivingInstructorSoftware } from './library/how-to-choose-driving-instructor-software.ts';
import { makingTaxDigitalForDrivingInstructors } from './library/making-tax-digital-for-driving-instructors.ts';
import { sidcupBelvedereErithDrivingTestCentres } from './library/sidcup-belvedere-erith-driving-test-centres.ts';
import { totalDriveVsMyDriveTime } from './library/total-drive-vs-mydrivetime.ts';
import { guidePhotoCredit, type GuideImageKey } from './images.ts';
import { parseGuideMarkdown, wordCount, type Block } from './markdown.ts';
import type { Guide, GuideAudience } from './types.ts';

export type { Block, Inline } from './markdown.ts';
export { parseGuideMarkdown, wordCount } from './markdown.ts';
export { guideImageKeys, guidePhotoCredit, guidePhotoCredits, isGuideImageKey, type GuideImageKey, type GuidePhotoCredit } from './images.ts';
export type { Guide, GuideAudience, GuidePlace, GuideQuestion, GuideSource } from './types.ts';

/** Every guide, newest first. A new one is written in `library` and added here. */
export const guides: readonly Guide[] = [
  howToChooseDrivingInstructorSoftware,
  totalDriveVsMyDriveTime,
  sidcupBelvedereErithDrivingTestCentres,
  makingTaxDigitalForDrivingInstructors,
  drivingInstructorExpenses,
  drivingTestBookingRules2026,
];

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

/** The pictures of the app a guide shows, in the order it shows them (D-387). */
export function guidePictures(blocks: readonly Block[]): Extract<Block, { kind: 'image' }>[] {
  return blocks.flatMap((block) => (block.kind === 'image' ? [block] : []));
}

/**
 * The geo tags a few search engines still read (D-387): the place the guide is about first, and
 * where it is when it is a town rather than a country.
 */
export function guideGeoTags(guide: Guide): Record<string, string> {
  const [first] = guide.places;
  if (first === undefined) return {};
  const point = first.point;
  return {
    'geo.region': first.region,
    'geo.placename': first.name,
    ...(point === undefined
      ? {}
      : { 'geo.position': `${String(point.latitude)};${String(point.longitude)}`, ICBM: `${String(point.latitude)}, ${String(point.longitude)}` }),
  };
}

/** The picture a shared link to a guide shows. */
export function guideCard(guide: Guide): ShareCard {
  return guideShareCard({ audience: audienceLabels[guide.audience], title: guide.title, minutes: readingMinutes(guide), updated: guideDate(guide.updated) });
}

/**
 * A picture as search is told about it: a screen of the app by its address, and a photograph with
 * who took it and the licence it is used under, as its credit on the page says (D-391).
 */
function pictureData(picture: { key: GuideImageKey; url: string }): string | Record<string, unknown> {
  const credit = guidePhotoCredit(picture.key);
  if (credit === null) return picture.url;
  return {
    '@type': 'ImageObject',
    contentUrl: picture.url,
    creator: { '@type': 'Person', name: credit.author },
    creditText: `${credit.author}, ${credit.licence}, via ${credit.via}`,
    license: credit.licenceUrl,
    acquireLicensePage: credit.sourceUrl,
  };
}

/**
 * What search is told about a guide (PRD 14.6): the Article, its questions as an FAQ, and where it
 * sits on the site. Everything in it is on the page as well; nothing is added for machines. The
 * Article carries the short answers as its abstract, the phrases it answers, the places it covers
 * and the pictures it shows (D-387).
 */
export function guideStructuredData(
  guide: Guide,
  site: { url: string; imageUrl: string; pictures?: readonly { key: GuideImageKey; url: string }[] },
): JsonLd {
  const url = `${site.url}${guidePath(guide.slug)}`;
  const pictures = (site.pictures ?? []).map(pictureData);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: guide.title,
        description: guide.description,
        abstract: guide.takeaways.join(' '),
        keywords: guide.keywords.join(', '),
        image: pictures.length === 0 ? site.imageUrl : [site.imageUrl, ...pictures],
        wordCount: wordCount(guideBlocks(guide)),
        spatialCoverage: guide.places.map((place) => ({
          '@type': 'Place',
          name: place.name,
          ...(place.point === undefined ? {} : { geo: { '@type': 'GeoCoordinates', latitude: place.point.latitude, longitude: place.point.longitude } }),
        })),
        datePublished: guide.published,
        dateModified: guide.updated,
        author: { '@type': 'Organization', name: guideAuthor, url: site.url },
        publisher: brandOrganization(site.url),
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
