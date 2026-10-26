import { brand } from '@repo/config/brand';
import { guidePath, guides } from '@repo/core/guides';
import { sitemapKinds, sitemapPaths } from '@repo/core/sitemap';
import { describe, expect, it } from 'vitest';
import { hostRedirect, isSitePath } from './hosts';

const site = brand.domain;
const app = brand.appHost;

describe('which host a request belongs on (D-084)', () => {
  it('sends an app address opened on the public site to the app, path and query kept, and not for good (D-134)', () => {
    expect(hostRedirect(site, '/app/learner/lessons', '?view=past')).toEqual({
      url: `${brand.appUrl}/app/learner/lessons?view=past`,
      // Temporary: a page that becomes public later must not stay redirected in caches and browsers.
      permanent: false,
    });
    expect(hostRedirect(`www.${site}`, '/book/sarah-khan', '')).toEqual({
      url: `${brand.appUrl}/book/sarah-khan`,
      permanent: false,
    });
    expect(hostRedirect(site.toUpperCase(), '/sign-in', '')?.url).toBe(`${brand.appUrl}/sign-in`);
  });

  it('leaves the public site its own pages', () => {
    expect(hostRedirect(site, '/', '')).toBeNull();
    expect(hostRedirect(`${site}:443`, '/', '')).toBeNull();
    expect(hostRedirect(site, '/instructors/leeds/sarah-khan', '')).toBeNull();
  });

  it('sends a public page opened on the app to the public site, for good, so search finds it in one place (D-109)', () => {
    expect(hostRedirect(app, '/instructors/leeds/sarah-khan', '?from=qr')).toEqual({
      url: `${brand.productionUrl}/instructors/leeds/sarah-khan?from=qr`,
      permanent: true,
    });
    // A path that only starts with the same letters is not one of them.
    expect(hostRedirect(app, '/instructorsx', '')).toBeNull();
    expect(isSitePath('/instructors')).toBe(false);
    expect(isSitePath('/instructors/manchester/emma-clarke')).toBe(true);
    expect(isSitePath('/schools/manchester/quayside-driving-school')).toBe(true);
    expect(isSitePath('/driving-lessons/london/croydon')).toBe(true);
    // The site's own pages (M5-09), and nothing that only starts like one.
    for (const path of ['/learners', '/instructors-software', '/driving-schools-software', '/pricing']) {
      expect(isSitePath(path)).toBe(true);
      expect(hostRedirect(app, path, '')).toEqual({ url: `${brand.productionUrl}${path}`, permanent: true });
      expect(hostRedirect(site, path, '')).toBeNull();
    }
    expect(isSitePath('/pricing/extra')).toBe(false);
  });

  it('keeps every page a sitemap lists on the public site, so search is never sent to the app (D-109, D-255)', () => {
    // One of each kind the database lists, and every guide, which the code lists itself.
    const entries = {
      instructors: [{ slug: 'sarah-khan', citySlug: 'leeds' }, { slug: 'emma-clarke', citySlug: null }],
      schools: [{ slug: 'quayside-driving-school', citySlug: 'manchester' }],
      places: [
        { citySlug: 'london', areaSlug: 'croydon', automatic: false, instructorCount: 500 },
        { citySlug: 'london', areaSlug: null, automatic: true, instructorCount: 500 },
      ],
    };
    for (const kind of sitemapKinds) {
      const paths = sitemapPaths(kind, entries);
      expect(paths.length, kind).toBeGreaterThan(0);
      for (const path of paths) {
        expect(hostRedirect(site, path, ''), path).toBeNull();
        // The app's own root is its door, not the site's home page (tested below).
        if (path !== '/') expect(hostRedirect(app, path, ''), path).toEqual({ url: `${brand.productionUrl}${path}`, permanent: true });
      }
    }
    // A guide's share picture is read from the site too, by whoever is drawing a link to it.
    const guide = guides[0];
    if (guide === undefined) throw new Error('There is no guide');
    expect(hostRedirect(site, `${guidePath(guide.slug)}/share.png`, '')).toBeNull();
  });

  it('keeps the page the printed QR codes open on the public site, with where they came from (D-404)', () => {
    expect(isSitePath('/join')).toBe(true);
    expect(hostRedirect(site, '/join', '?utm_source=card')).toBeNull();
    expect(hostRedirect(`www.${site}`, '/join', '?utm_source=leaflet')).toBeNull();
    expect(hostRedirect(app, '/join', '?utm_source=flyer')).toEqual({ url: `${brand.productionUrl}/join?utm_source=flyer`, permanent: true });
    // Not listed for search, and nothing that only starts like it.
    for (const kind of sitemapKinds) {
      expect(sitemapPaths(kind, { instructors: [], schools: [], places: [] })).not.toContain('/join');
    }
    expect(isSitePath('/joined')).toBe(false);
    // Getting started is the app's, whichever host it is asked for on.
    expect(hostRedirect(site, '/start', '?utm_source=card')).toEqual({ url: `${brand.appUrl}/start?utm_source=card`, permanent: false });
  });

  it('sends the app’s bare root to getting started, which knows where somebody signed in belongs', () => {
    expect(hostRedirect(app, '/', '?from=email')).toEqual({ url: `${brand.appUrl}/start?from=email`, permanent: false });
  });

  it('leaves every app page, and every other host, alone', () => {
    expect(hostRedirect(app, '/app/instructor', '')).toBeNull();
    expect(hostRedirect('localhost:3000', '/app/instructor', '')).toBeNull();
    expect(hostRedirect('web-git-m3-payments.vercel.app', '/', '')).toBeNull();
    expect(hostRedirect(null, '/app', '')).toBeNull();
  });
});
