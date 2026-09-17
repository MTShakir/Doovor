import { describe, expect, it } from 'vitest';
import {
  isSitemapKind,
  SITEMAP_URL_LIMIT,
  sitemapIndexXml,
  sitemapKinds,
  sitemapPath,
  sitemapPaths,
  sitePagePaths,
  urlSetXml,
  type SitemapEntries,
} from './sitemap';

const entries: SitemapEntries = {
  instructors: [
    { slug: 'sarah-khan', citySlug: 'leeds' },
    { slug: 'rhian-jones', citySlug: null },
  ],
  schools: [{ slug: 'quayside-driving-school', citySlug: 'manchester' }],
  places: [
    { citySlug: 'london', areaSlug: null, automatic: false, instructorCount: 5 },
    { citySlug: 'london', areaSlug: 'camden', automatic: false, instructorCount: 3 },
    { citySlug: 'london', areaSlug: 'croydon', automatic: false, instructorCount: 2 },
    { citySlug: 'london', areaSlug: null, automatic: true, instructorCount: 1 },
  ],
};

describe('sitemaps by type (PRD 14.6, M5-08)', () => {
  it('has one sitemap for each kind of page, each at its own address', () => {
    expect(sitemapKinds).toEqual(['pages', 'instructors', 'schools', 'places']);
    expect(sitemapKinds.map(sitemapPath)).toEqual([
      '/sitemaps/pages.xml',
      '/sitemaps/instructors.xml',
      '/sitemaps/schools.xml',
      '/sitemaps/places.xml',
    ]);
    expect(isSitemapKind('instructors')).toBe(true);
    expect(isSitemapKind('learners')).toBe(false);
    expect(isSitemapKind('toString')).toBe(false);
  });

  it('lists every profile at its one address, and a place only once it is worth indexing', () => {
    expect(sitemapPaths('pages', entries)).toEqual(sitePagePaths);
    expect(sitemapPaths('instructors', entries)).toEqual(['/instructors/leeds/sarah-khan', '/instructors/uk/rhian-jones']);
    expect(sitemapPaths('schools', entries)).toEqual(['/schools/manchester/quayside-driving-school']);
    // Croydon lists two and the automatic page one: both still out of search (PRD 8.3).
    expect(sitemapPaths('places', entries)).toEqual(['/driving-lessons/london', '/driving-lessons/london/camden']);
  });

  it('writes a sitemap as sitemaps.org sets it out, with anything XML reads as markup escaped', () => {
    expect(urlSetXml(['https://example.com/', 'https://example.com/a?b=1&c=<2>'])).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        '<url><loc>https://example.com/</loc></url>\n' +
        '<url><loc>https://example.com/a?b=1&amp;c=&lt;2&gt;</loc></url>\n' +
        '</urlset>\n',
    );
    expect(urlSetXml([])).toBe('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>\n');
  });

  it('writes the index of sitemaps', () => {
    expect(sitemapIndexXml(["https://example.com/sitemaps/o'neill.xml"])).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        '<sitemap><loc>https://example.com/sitemaps/o&apos;neill.xml</loc></sitemap>\n' +
        '</sitemapindex>\n',
    );
  });

  it('refuses more addresses than search engines read from one sitemap, rather than dropping some', () => {
    const urls = Array.from({ length: SITEMAP_URL_LIMIT + 1 }, (_, index) => `https://example.com/${String(index)}`);
    expect(() => urlSetXml(urls)).toThrow(RangeError);
    expect(() => urlSetXml(urls.slice(1))).not.toThrow();
  });
});
