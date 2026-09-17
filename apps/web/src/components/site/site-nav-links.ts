import type { Route } from 'next';

/** The site's own pages, in the order the header and footer list them (PRD 8.3, M5-09). */
export const siteNav: readonly { href: Route; label: string }[] = [
  { href: '/learners', label: 'Learners' },
  { href: '/instructors-software', label: 'Instructors' },
  { href: '/driving-schools-software', label: 'Schools' },
  { href: '/pricing', label: 'Pricing' },
];
