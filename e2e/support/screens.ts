import type { RoleKey } from './accounts';

/**
 * One list of the screens the sweeps walk: the content security policy (M6-04) and the
 * accessibility scan (M6-06). A screen added here is opened by both, so a new page is watched by
 * both from the day it exists.
 *
 * These are the screens a person reaches by looking around, with nothing set up first. A screen
 * that only exists after something has happened, a lesson to pay for or an invitation to accept,
 * belongs to the flow that makes it, and the flows scan those where they stand.
 */
export const publicPages = [
  '/',
  '/learners',
  '/pricing',
  '/instructors-software',
  '/driving-schools-software',
  '/driving-lessons/leeds',
  '/driving-lessons/london/city-of-london',
  '/driving-lessons/manchester/automatic',
  '/instructors/leeds/sarah-khan',
  // Manchester, not Leeds: the school is based there, and the Leeds address is a redirect. It is
  // sent as an instruction after the shell has streamed rather than as a 308, so a scan that
  // starts on the shell is still running when the document is swapped, and axe walks frames and
  // dies on the one that has gone (D-219). public-profile.spec.ts covers the redirect itself.
  '/schools/manchester/quayside-driving-school',
  '/book/sarah-khan',
  '/sign-in',
  '/sign-up',
  '/start',
  '/forgot-password',
  '/privacy',
  '/cookies',
  '/terms',
  '/business-terms',
  '/accessibility',
];

export const portals: [RoleKey, string[]][] = [
  [
    'instructor',
    [
      '/app/instructor',
      '/app/instructor/diary',
      '/app/instructor/learners',
      '/app/instructor/learners/import',
      '/app/instructor/money',
      '/app/instructor/profile',
      '/app/instructor/settings',
      '/app/instructor/more',
      '/app/instructor/gallery',
      '/account',
      '/account/name',
      '/notifications',
      '/notifications/settings',
    ],
  ],
  [
    'learner',
    [
      '/app/learner',
      '/app/learner/lessons',
      '/app/learner/payments',
      '/app/learner/progress',
      '/app/learner/account',
      '/notifications',
      '/account/install',
    ],
  ],
  ['schoolOwner', ['/app/school', '/app/school/diary', '/app/school/instructors', '/app/school/learners', '/app/school/money', '/app/school/gallery', '/app/school/settings', '/app/school/more']],
  ['admin', ['/admin', '/admin/businesses', '/admin/instructors', '/admin/learners', '/admin/payments', '/admin/deletions', '/admin/regions', '/admin/settings', '/admin/verification', '/admin/gallery', '/admin/audit-log']],
];
