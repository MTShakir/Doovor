/**
 * The pictures a guide can show (D-387): screens of the app on a phone, photographed from the local
 * app with its made-up people, each drawn by the site from a file of its own. A guide names one on
 * a line of its own, `![What it shows](booking-page "What to notice")`, and the Markdown refuses a
 * name that is not here. The words are the guide's: what the picture shows, for somebody who
 * cannot see it, and a caption saying what to notice.
 */
export const guideImageKeys = [
  'booking-page',
  'booking-link',
  'today',
  'diary-week',
  'lesson-record',
  'money',
  'learner-pay',
  'learner-lessons',
  'learner-contact',
  'public-profile',
  'tax-year-export',
  'expenses',
  'bookkeeping',
] as const;

export type GuideImageKey = (typeof guideImageKeys)[number];

export function isGuideImageKey(value: string): value is GuideImageKey {
  return (guideImageKeys as readonly string[]).includes(value);
}
