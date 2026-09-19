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
  '/schools/leeds/quayside-driving-school',
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
      '/account',
      '/notifications',
      '/notifications/settings',
    ],
  ],
  ['learner', ['/app/learner', '/app/learner/lessons', '/app/learner/payments', '/app/learner/progress', '/app/learner/account', '/notifications']],
  ['schoolOwner', ['/app/school', '/app/school/diary', '/app/school/instructors', '/app/school/learners', '/app/school/money', '/app/school/settings', '/app/school/more']],
  ['admin', ['/admin', '/admin/businesses', '/admin/instructors', '/admin/learners', '/admin/regions', '/admin/settings', '/admin/verification', '/admin/audit-log']],
];
