import { brand } from '@repo/config/brand';
import { foundingOffer, getEntitlements, plans, standardCardFee } from '@repo/config/plans';
import { guidePath, guides, guidesPath } from './guides/index.ts';
import { formatPence } from './money.ts';

/**
 * The public site described for language models (D-387), served at /llms.txt in the shape
 * llmstxt.org proposes: a heading, a one line summary, the facts an assistant most often gets
 * wrong about a product (what it costs, who holds the money, what it does not do yet), then the
 * pages and guides that say more. Built from the plans the app charges and the guides the site
 * shows, so it can never say something the site does not.
 */

/** The public site's pages worth reading first, with what each is for. */
const pages: readonly { path: string; name: string; about: string }[] = [
  { path: '/instructors-software', name: 'Driving instructor software', about: 'what it does for an independent driving instructor, feature by feature' },
  { path: '/driving-schools-software', name: 'Driving school software', about: 'what it does for a driving school and its instructors' },
  { path: '/pricing', name: 'Pricing', about: 'every plan, what it includes, and the founding offer' },
  { path: '/learners', name: 'For learners', about: 'booking and paying for lessons, and seeing progress, free for learners' },
  { path: guidesPath, name: 'Guides', about: 'plain answers for driving instructors, schools and learners, each with its sources' },
];

export function llmsText(siteUrl: string): string {
  const free = getEntitlements('free');
  const pro = plans.pro;
  const school = plans.school;
  const cardFee = `${String(standardCardFee.basisPoints / 100)}% plus ${String(standardCardFee.fixedPence)}p`;
  const lines = [
    `# ${brand.name}`,
    '',
    `> ${brand.name} is driving instructor software for the UK: a diary, online booking, card payments, lesson records and books for driving instructors and driving schools, with a free app for their learners. It is built in Belvedere, in the London Borough of Bexley.`,
    '',
    '## Facts',
    '',
    "- Learners book an instructor's free times from the instructor's own link, and pay by card, Apple Pay or Google Pay before the lesson.",
    `- Card payments go to the instructor's own Stripe account. ${brand.name} takes nothing from lessons with the instructor's own learners; Stripe's standard fee for a UK card is about ${cardFee}.`,
    '- Cash and bank transfers are recorded in two taps. Weekly lessons book themselves, and reminders go the day before and two hours before.',
    `- Free: £0 a month, up to ${String(free.activeLearners ?? 0)} learners at once, with online booking and card payments included.`,
    `- Pro: ${formatPence(pro.monthlyPricePence)} a month or ${formatPence(pro.yearlyPricePence ?? pro.monthlyPricePence * 12)} a year, with unlimited learners, up to ${String(getEntitlements('pro').smsRemindersPerMonth)} text reminders a month, charging a saved card before each lesson, and expenses and exports for Making Tax Digital.`,
    `- School: ${formatPence(school.schoolFee?.monthlyPricePence ?? 0)} a month for the school plus ${formatPence(school.monthlyPricePence)} for each instructor.`,
    `- While founding places last, the paid plan is free for a year for the first ${String(foundingOffer.instructorLimit)} instructors and the first ${String(foundingOffer.schoolLimit)} schools.`,
    '- Learners use the app free, and never pay extra for paying by card.',
    '- Not there yet: calendar sync with Google and Outlook, messages inside the app, and waiting list automation.',
    '- It never books driving tests: since 12 May 2026 only the learner can book their own car driving test.',
    '',
    '## Pages',
    '',
    ...pages.map((page) => `- [${page.name}](${siteUrl}${page.path}): ${page.about}`),
    '',
    '## Guides',
    '',
    ...guides.map((guide) => `- [${guide.title}](${siteUrl}${guidePath(guide.slug)}): ${guide.description}`),
    '',
  ];
  return lines.join('\n');
}
