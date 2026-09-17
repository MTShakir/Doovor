/**
 * Lighthouse on the public pages (NFR-PERF-04, M5-24): an instructor's profile, a school's profile, a
 * city, an area and a city's automatic page, from the production build and the seeded database, with
 * the app already running on port 3000 (see the Lighthouse job in .github/workflows/ci.yml).
 *
 * Each page is measured three times as Lighthouse measures by default: a mid-range phone on a slow 4G
 * connection. The median of each page's three scores must be 90 or more for performance, accessibility,
 * best practices and SEO (D-132).
 */
const origin = process.env.LIGHTHOUSE_ORIGIN ?? 'http://localhost:3000';

// The median of each category's three scores. Lighthouse CI's 'median-run' instead picks one run by its
// paint timings and judges every category on that run alone, which passed a page whose median was 79.
const atLeast90 = ['error', { minScore: 0.9, aggregationMethod: 'median' }];

module.exports = {
  ci: {
    collect: {
      url: [
        `${origin}/instructors/leeds/sarah-khan`,
        `${origin}/schools/manchester/quayside-driving-school`,
        `${origin}/driving-lessons/manchester`,
        `${origin}/driving-lessons/manchester/salford`,
        `${origin}/driving-lessons/manchester/automatic`,
      ],
      numberOfRuns: 3,
      settings: {
        // The phone Lighthouse emulates, saying it is Lighthouse as PageSpeed Insights does. Next.js
        // gives search engines, link previews and Lighthouse titles and descriptions in the head, and
        // streams them into the body for everybody else; without the marker a run is served as a
        // person and finds no description in the head (D-132).
        emulatedUserAgent:
          'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse',
        // Ubuntu 24.04 runners refuse Chrome the user namespaces its sandbox needs. The browser only
        // ever opens this app on localhost there, as Playwright's does without a sandbox too.
        ...(process.env.CI ? { chromeFlags: '--headless=new --no-sandbox' } : {}),
        // Outside production the site asks search engines not to crawl it at all (robots.ts, D-047),
        // and a place page with fewer than three instructors asks not to be indexed (M5-07). Both are
        // on purpose and checked in seo.spec.ts; every other SEO audit still counts.
        skipAudits: ['is-crawlable'],
      },
    },
    assert: {
      assertions: {
        'categories:performance': atLeast90,
        'categories:accessibility': atLeast90,
        'categories:best-practices': atLeast90,
        'categories:seo': atLeast90,
      },
    },
    upload: {
      // Reports stay with the run: the public report storage would publish the pages it measured.
      target: 'filesystem',
      outputDir: '.lighthouseci/reports',
    },
  },
};
