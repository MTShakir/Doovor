import { brand } from '@repo/config/brand';
import { describe, expect, it } from 'vitest';
import { offlinePage } from './offline-page';

describe('the page for a screen with no connection (PRD 8.1, M4-08)', () => {
  const html = offlinePage();

  it('says what happened and what still works, in the brand\'s name and colours', () => {
    expect(html).toContain(`<header>${brand.name}</header>`);
    expect(html).toContain('<h1>No connection</h1>');
    expect(html).toContain('Today and the lessons on it open without one');
    expect(html).toContain(`background:${brand.colours.black}`);
  });

  it('tries again with no script, by linking to the address it is showing at', () => {
    expect(html).toContain('<a class="again" href="">Try again</a>');
    expect(html).not.toMatch(/<script|onclick/i);
  });

  it('keeps to the copy rules: no dashes, and never indexed', () => {
    expect(html).not.toMatch(/[\u2013\u2014]/);
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
  });
});
