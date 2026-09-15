/**
 * Structured data for the public pages (PUB-02, PRD 14.6, M5-04).
 *
 * Search engines read a page's JSON-LD to know what it is about: an instructor is a Person who
 * provides a Service with Offers for its prices, a school is a LocalBusiness that is also an
 * EducationalOrganization (schema.org has no driving school type, D-111), and each page says where
 * it sits with a BreadcrumbList. No AggregateRating until reviews exist (Phase 2). Everything here
 * is what the page already shows; nothing private is added for machines.
 */

import { formatMinutes } from './time/index.ts';

export type JsonLd = Record<string, unknown>;

export interface Crumb {
  name: string;
  url: string;
}

export interface PricedLesson {
  name: string;
  durationMinutes: number;
  pricePence: number;
}

/** A price as schema.org writes it: "42.00", worked out in whole pence. */
export function priceText(pence: number): string {
  return `${String(Math.trunc(pence / 100))}.${String(pence % 100).padStart(2, '0')}`;
}

function lessonOffers(lessons: readonly PricedLesson[], bookingUrl: string): JsonLd[] {
  return lessons.map((lesson) => ({
    '@type': 'Offer',
    name: `${lesson.name}, ${formatMinutes(lesson.durationMinutes)}`,
    price: priceText(lesson.pricePence),
    priceCurrency: 'GBP',
    url: bookingUrl,
  }));
}

function breadcrumbList(crumbs: readonly Crumb[]): JsonLd {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: crumb.url,
    })),
  };
}

export interface InstructorStructuredDataInput {
  /** The profile's own address, in full. */
  url: string;
  bookingUrl: string;
  name: string;
  imageUrl?: string;
  /** What kind of instructor, in words (qualificationWords). */
  jobTitle: string;
  languages: readonly string[];
  cityName: string | null;
  school: { name: string; url: string } | null;
  lessons: readonly PricedLesson[];
  /** Home first and the profile last. */
  breadcrumbs: readonly Crumb[];
}

/** PUB-02: Person plus Service for an instructor, with an Offer for each price. */
export function instructorStructuredData(input: InstructorStructuredDataInput): JsonLd {
  const person = `${input.url}#person`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Person',
        '@id': person,
        name: input.name,
        url: input.url,
        ...(input.imageUrl === undefined ? {} : { image: input.imageUrl }),
        jobTitle: input.jobTitle,
        knowsLanguage: [...input.languages],
        ...(input.school === null
          ? {}
          : { worksFor: { '@type': ['LocalBusiness', 'EducationalOrganization'], name: input.school.name, url: input.school.url } }),
      },
      {
        '@type': 'Service',
        '@id': `${input.url}#lessons`,
        name: `Driving lessons with ${input.name}`,
        serviceType: 'Driving lessons',
        provider: { '@id': person },
        ...(input.cityName === null ? {} : { areaServed: { '@type': 'City', name: input.cityName } }),
        offers: lessonOffers(input.lessons, input.bookingUrl),
      },
      breadcrumbList(input.breadcrumbs),
    ],
  };
}

export interface SchoolStructuredDataInput {
  url: string;
  name: string;
  logoUrl?: string;
  cityName: string | null;
  instructors: readonly { name: string; url: string }[];
  lessons: readonly PricedLesson[];
  breadcrumbs: readonly Crumb[];
}

/** PUB-02: LocalBusiness for a school, with its instructors and an Offer for each of its prices. */
export function schoolStructuredData(input: SchoolStructuredDataInput): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': ['LocalBusiness', 'EducationalOrganization'],
        '@id': `${input.url}#school`,
        name: input.name,
        url: input.url,
        ...(input.logoUrl === undefined ? {} : { logo: input.logoUrl }),
        ...(input.cityName === null
          ? {}
          : {
              address: { '@type': 'PostalAddress', addressLocality: input.cityName, addressCountry: 'GB' },
              areaServed: { '@type': 'City', name: input.cityName },
            }),
        employee: input.instructors.map((instructor) => ({ '@type': 'Person', name: instructor.name, url: instructor.url })),
        makesOffer: lessonOffers(input.lessons, input.url),
      },
      breadcrumbList(input.breadcrumbs),
    ],
  };
}

/** PRD 14.6: breadcrumb markup on city and area pages, home first and the page itself last. */
export function breadcrumbStructuredData(crumbs: readonly Crumb[]): JsonLd {
  return { '@context': 'https://schema.org', ...breadcrumbList(crumbs) };
}

/**
 * JSON-LD for a script tag. "<" is written as its escape, so text somebody typed, such as a
 * name with "</script>" in it, can never end the tag early.
 */
export function serializeJsonLd(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
