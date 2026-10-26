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

/**
 * A place a guide is about, or where what it says applies (D-387): a tag under its title, and the
 * area search is told it covers. A town has a point, for the page's geo tags; a country needs none.
 */
export interface GuidePlace {
  /** As people search for it: 'Sidcup', 'England, Scotland and Wales'. */
  name: string;
  /** Its ISO 3166 code: 'GB' for the country, 'GB-BEX' for the London Borough of Bexley. */
  region: string;
  /** Where it is, to four decimal places. */
  point?: { latitude: number; longitude: number };
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
  /**
   * The short answers, at the top of the page (D-387): what somebody asking the question wants
   * first, a sentence each, written so a search engine or an assistant can quote one and be right.
   */
  takeaways: readonly string[];
  /**
   * What people type into search, or ask an assistant, that the guide answers (D-387). The first is
   * the phrase it is written for, and is in its title and its words; all are given to search.
   */
  keywords: readonly string[];
  /** Where it applies, the place it is about first (D-387). */
  places: readonly GuidePlace[];
  /** Calendar dates, 2026-10-13. */
  published: string;
  updated: string;
  /** The guide in the Markdown `parseGuideMarkdown` reads. */
  body: string;
  /** Asked and answered at the foot of the page, and given to search as an FAQ. */
  questions: readonly GuideQuestion[];
  /**
   * Where every fact in it can be checked: GOV.UK for the government's rules and figures, and a
   * company's own pages for what it sells (D-387).
   */
  sources: readonly GuideSource[];
  /** Other guides to read next, by slug. */
  related: readonly string[];
}
