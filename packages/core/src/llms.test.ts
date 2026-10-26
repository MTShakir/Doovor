import { brand } from '@repo/config/brand';
import { describe, expect, it } from 'vitest';
import { guidePath, guides } from './guides/index.ts';
import { llmsText } from './llms.ts';
import { sitePagePaths } from './sitemap.ts';

describe('the site described for language models (D-387)', () => {
  const text = llmsText('https://example.com');

  it('starts with the name and a one line summary, as llmstxt.org lays it out', () => {
    const [heading, blank, summary] = text.split('\n');
    expect(heading).toBe(`# ${brand.name}`);
    expect(blank).toBe('');
    expect(summary?.startsWith(`> ${brand.name} is driving instructor software for the UK`)).toBe(true);
  });

  it('gives the prices from the plans the app charges, and who holds the money', () => {
    expect(text).toContain('- Free: £0 a month, up to 10 learners at once');
    expect(text).toContain('- Pro: £12 a month or £120 a year');
    expect(text).toContain('- School: £15 a month for the school plus £6 for each instructor.');
    expect(text).toContain("Card payments go to the instructor's own Stripe account.");
    expect(text).toContain('about 1.5% plus 20p');
  });

  it('says what it does not do, so an assistant does not promise it', () => {
    expect(text).toContain('- Not there yet: calendar sync with Google and Outlook');
    expect(text).toContain('It never books driving tests');
  });

  it('links every guide and only pages that exist, with whole addresses', () => {
    for (const guide of guides) expect(text).toContain(`- [${guide.title}](https://example.com${guidePath(guide.slug)}): ${guide.description}`);
    const links = [...text.matchAll(/\]\((https:\/\/example\.com[^)]*)\)/g)].map((match) => new URL(match[1] ?? '').pathname);
    const known = new Set([...sitePagePaths, ...guides.map((guide) => guidePath(guide.slug))]);
    for (const path of links) expect(known.has(path), path).toBe(true);
  });

  it('names our own accounts on other sites, and only those (D-403)', () => {
    const section = text.split('## Official accounts\n\n')[1] ?? '';
    expect(section.trim().split('\n')).toEqual(brand.social.map((account) => `- [${account.label}](${account.url}): ${account.handle}`));
  });

  it('carries no long dash and ends with a new line', () => {
    expect(text).not.toMatch(new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`));
    expect(text.endsWith('\n')).toBe(true);
  });
});
