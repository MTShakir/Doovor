import { describe, expect, it } from 'vitest';
import vocabulary from './schema-org-subset.json' with { type: 'json' };
import {
  breadcrumbStructuredData,
  instructorStructuredData,
  priceText,
  schoolStructuredData,
  serializeJsonLd,
  type JsonLd,
} from './structured-data';

const types: Record<string, { parents: string[] }> = vocabulary.types;
const properties: Record<string, string[]> = vocabulary.properties;

/** A type and every type above it, as schema.org defines them. */
function lineage(type: string): string[] {
  const parents = types[type]?.parents ?? [];
  return [type, ...parents.flatMap(lineage)];
}

/**
 * Checks a JSON-LD value against schema.org's own definitions: every type is a schema.org type,
 * and every property belongs to one of the node's types or a type above it (domainIncludes).
 * Returns what is wrong, empty when nothing is.
 */
function problems(value: unknown, path = '$'): string[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => problems(item, `${path}[${String(index)}]`));
  if (value === null || typeof value !== 'object') return [];

  const node = value as JsonLd;
  const declared = node['@type'];
  const nodeTypes = declared === undefined ? [] : Array.isArray(declared) ? (declared as string[]) : [declared as string];
  const found: string[] = [];
  for (const type of nodeTypes) {
    if (!(type in types)) found.push(`${path}: ${type} is not a schema.org type`);
  }
  const allowed = new Set(nodeTypes.flatMap(lineage));

  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith('@')) {
      if (key === '@graph') found.push(...problems(child, `${path}.@graph`));
      continue;
    }
    if (nodeTypes.length > 0) {
      const domains = properties[key];
      if (domains === undefined) found.push(`${path}.${key}: not a property the pages are checked for`);
      else if (!domains.some((domain) => allowed.has(domain))) {
        found.push(`${path}.${key}: not a property of ${nodeTypes.join(' or ')}`);
      }
    }
    found.push(...problems(child, `${path}.${key}`));
  }
  return found;
}

const crumbs = [
  { name: 'Home', url: 'https://example.com' },
  { name: 'Driving lessons in Leeds', url: 'https://example.com/driving-lessons/leeds' },
  { name: 'Sarah Khan', url: 'https://example.com/instructors/leeds/sarah-khan' },
];

describe('structured data for the public pages (PUB-02, M5-04)', () => {
  it('writes a price in pounds and pence from whole pence', () => {
    expect(priceText(4200)).toBe('42.00');
    expect(priceText(4250)).toBe('42.50');
    expect(priceText(5)).toBe('0.05');
  });

  it('describes an instructor as a Person providing a Service, with an Offer for each price, all valid schema.org', () => {
    const data = instructorStructuredData({
      url: 'https://example.com/instructors/leeds/sarah-khan',
      bookingUrl: 'https://app.example.com/book/sarah-khan',
      name: 'Sarah Khan',
      imageUrl: 'https://example.supabase.co/storage/v1/object/public/avatars/sarah.jpg',
      jobTitle: 'Approved driving instructor',
      languages: ['English', 'Urdu'],
      cityName: 'Leeds',
      school: null,
      lessons: [
        { name: 'Standard lesson', durationMinutes: 60, pricePence: 4200 },
        { name: 'Standard lesson', durationMinutes: 120, pricePence: 8200 },
      ],
      breadcrumbs: crumbs,
    });

    expect(problems(data)).toEqual([]);
    const [person, service, trail] = data['@graph'] as JsonLd[];
    expect(person).toMatchObject({ '@type': 'Person', name: 'Sarah Khan', jobTitle: 'Approved driving instructor' });
    expect(service).toMatchObject({
      '@type': 'Service',
      provider: { '@id': 'https://example.com/instructors/leeds/sarah-khan#person' },
      areaServed: { '@type': 'City', name: 'Leeds' },
    });
    expect(service?.offers).toEqual([
      { '@type': 'Offer', name: 'Standard lesson, 1 hour', price: '42.00', priceCurrency: 'GBP', url: 'https://app.example.com/book/sarah-khan' },
      { '@type': 'Offer', name: 'Standard lesson, 2 hours', price: '82.00', priceCurrency: 'GBP', url: 'https://app.example.com/book/sarah-khan' },
    ]);
    expect(trail).toEqual({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://example.com' },
        { '@type': 'ListItem', position: 2, name: 'Driving lessons in Leeds', item: 'https://example.com/driving-lessons/leeds' },
        { '@type': 'ListItem', position: 3, name: 'Sarah Khan', item: 'https://example.com/instructors/leeds/sarah-khan' },
      ],
    });
    // No reviews exist yet, so nothing claims a rating (Phase 2).
    expect(JSON.stringify(data)).not.toContain('Rating');
  });

  it('names the school an instructor works for, and leaves out what is not known', () => {
    const data = instructorStructuredData({
      url: 'https://example.com/instructors/manchester/emma-clarke',
      bookingUrl: 'https://app.example.com/book/emma-clarke',
      name: 'Emma Clarke',
      jobTitle: 'Approved driving instructor',
      languages: ['English'],
      cityName: null,
      school: { name: 'Quayside Driving School', url: 'https://example.com/schools/manchester/quayside-driving-school' },
      lessons: [],
      breadcrumbs: crumbs.slice(0, 1),
    });
    expect(problems(data)).toEqual([]);
    const [person, service] = data['@graph'] as JsonLd[];
    expect(person?.worksFor).toEqual({
      '@type': ['LocalBusiness', 'EducationalOrganization'],
      name: 'Quayside Driving School',
      url: 'https://example.com/schools/manchester/quayside-driving-school',
    });
    expect(person).not.toHaveProperty('image');
    expect(service).not.toHaveProperty('areaServed');
  });

  it('describes a school as a LocalBusiness with its instructors and prices, all valid schema.org', () => {
    const data = schoolStructuredData({
      url: 'https://example.com/schools/manchester/quayside-driving-school',
      name: 'Quayside Driving School',
      cityName: 'Manchester',
      instructors: [
        { name: 'Emma Clarke', url: 'https://example.com/instructors/manchester/emma-clarke' },
        { name: 'Tom Walsh', url: 'https://example.com/instructors/manchester/tom-walsh' },
      ],
      lessons: [{ name: 'Standard lesson', durationMinutes: 60, pricePence: 4400 }],
      breadcrumbs: crumbs.slice(0, 1),
    });
    expect(problems(data)).toEqual([]);
    const [school] = data['@graph'] as JsonLd[];
    expect(school).toMatchObject({
      '@type': ['LocalBusiness', 'EducationalOrganization'],
      address: { '@type': 'PostalAddress', addressLocality: 'Manchester', addressCountry: 'GB' },
      employee: [
        { '@type': 'Person', name: 'Emma Clarke', url: 'https://example.com/instructors/manchester/emma-clarke' },
        { '@type': 'Person', name: 'Tom Walsh', url: 'https://example.com/instructors/manchester/tom-walsh' },
      ],
    });
  });

  it('marks a city page with its breadcrumbs alone, valid schema.org', () => {
    const data = breadcrumbStructuredData(crumbs.slice(0, 2));
    expect(problems(data)).toEqual([]);
    expect(data).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://example.com' },
        { '@type': 'ListItem', position: 2, name: 'Driving lessons in Leeds', item: 'https://example.com/driving-lessons/leeds' },
      ],
    });
  });

  it('the checker itself refuses what schema.org does not define', () => {
    expect(problems({ '@type': 'DrivingSchool', name: 'x' })).toEqual([
      '$: DrivingSchool is not a schema.org type',
      '$.name: not a property of DrivingSchool',
    ]);
    expect(problems({ '@type': 'Person', price: '1.00' })).toEqual(['$.price: not a property of Person']);
  });

  it('can never end its script tag early, whatever somebody typed', () => {
    const text = serializeJsonLd({ name: 'Sam </script><script>alert(1)</script>' });
    expect(text).not.toContain('<');
    expect(JSON.parse(text)).toEqual({ name: 'Sam </script><script>alert(1)</script>' });
  });
});
