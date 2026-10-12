/** A guide on the public site (PRD 8.3, 14.6, D-255): who it is for, its words, and where its facts come from. */

export type GuideAudience = 'learners' | 'instructors' | 'schools';

export interface GuideQuestion {
  question: string;
  answer: string;
}

export interface GuideSource {
  label: string;
  url: string;
}

export interface Guide {
  /** Its address under /guides: lower case words joined by hyphens. */
  slug: string;
  audience: GuideAudience;
  /** The page's heading, and its title in search. */
  title: string;
  /** What search shows under the title: 70 to 160 characters. */
  description: string;
  /** The opening line under the title. */
  summary: string;
  /** Calendar dates, 2026-10-13. */
  published: string;
  updated: string;
  /** The guide in the Markdown `parseGuideMarkdown` reads. */
  body: string;
  /** Asked and answered at the foot of the page, and given to search as an FAQ. */
  questions: readonly GuideQuestion[];
  /** Where every fact in it can be checked: GOV.UK first. */
  sources: readonly GuideSource[];
  /** Other guides to read next, by slug. */
  related: readonly string[];
}
