import type { Route } from 'next';

/** The site's own pages, in the order the header and footer list them (PRD 8.3, M5-09). */
export const siteNav: readonly { href: Route; label: string }[] = [
  { href: '/learners', label: 'Learners' },
  { href: '/instructors-software', label: 'Instructors' },
  { href: '/driving-schools-software', label: 'Schools' },
  { href: '/pricing', label: 'Pricing' },
];

/** The pages the law asks a site to carry (NFR-PRV-02, PRD 15, M6-07). */
export const legalNav: readonly { href: Route; label: string }[] = [
  { href: '/privacy', label: 'Privacy notice' },
  { href: '/cookies', label: 'Cookies' },
  { href: '/terms', label: 'Terms for learners' },
  { href: '/business-terms', label: 'Terms for instructors' },
  { href: '/accessibility', label: 'Accessibility' },
];
