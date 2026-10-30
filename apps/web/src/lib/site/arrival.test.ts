import { beforeEach, describe, expect, it } from 'vitest';
import { beginVisit, carriedHref, forgetVisit, learnTags } from './arrival';

const ownHosts = ['example.com', 'app.example.com'];
const app = 'https://app.example.com';

beforeEach(() => {
  forgetVisit();
});

describe('where this visit came from, held in the page (D-413)', () => {
  it('begins a visit on a page opened from somewhere else, and keeps it for the pages after', () => {
    const first = beginVisit({ path: '/join', search: '?utm_source=card&utm_campaign=week1', referrer: '', navigation: 'navigate', ownHosts });
    expect(first.entry).toBe(true);
    expect(first.arrival).toMatchObject({ landing: '/join', tags: { source: 'card', medium: null, campaign: 'week1' } });

    const second = beginVisit({ path: '/pricing', search: '', referrer: '', navigation: 'navigate', ownHosts });
    expect(second.entry).toBe(false);
    expect(second.arrival.landing).toBe('/join');
    expect(second.arrival.search).toBe('?utm_source=card&utm_campaign=week1');
  });

  it('does not begin one on a page reached from another of ours, or opened again', () => {
    const fromUs = beginVisit({ path: '/pricing', search: '', referrer: 'https://www.example.com/join', navigation: 'navigate', ownHosts });
    expect(fromUs.entry).toBe(false);
    expect(fromUs.arrival).toMatchObject({ landing: null, referrer: '' });

    forgetVisit();
    expect(beginVisit({ path: '/', search: '', referrer: 'https://www.google.com/', navigation: 'reload', ownHosts }).entry).toBe(false);
    forgetVisit();
    expect(beginVisit({ path: '/', search: '', referrer: '', navigation: 'back_forward', ownHosts }).entry).toBe(false);
    forgetVisit();
    expect(beginVisit({ path: '/', search: '', referrer: 'https://www.google.com/', navigation: undefined, ownHosts }).entry).toBe(true);
  });

  it('gives a link into getting started or sign-up the tags the visit came with', () => {
    beginVisit({ path: '/join', search: '?utm_source=card&utm_campaign=week1', referrer: '', navigation: 'navigate', ownHosts });
    expect(carriedHref(`${app}/start`, app)).toBe(`${app}/start?utm_source=card&utm_campaign=week1`);
    expect(carriedHref(`${app}/sign-up?role=instructor`, app)).toBe(`${app}/sign-up?role=instructor&utm_source=card&utm_campaign=week1`);
    expect(carriedHref(`${app}/sign-up?role=instructor&utm_source=card`, app)).toBe(`${app}/sign-up?role=instructor&utm_source=card&utm_campaign=week1`);
  });

  it('leaves every other link alone', () => {
    beginVisit({ path: '/join', search: '?utm_source=card', referrer: '', navigation: 'navigate', ownHosts });
    expect(carriedHref(`${app}/sign-in`, app)).toBe(`${app}/sign-in`);
    expect(carriedHref('https://example.com/pricing', app)).toBe('https://example.com/pricing');
    expect(carriedHref('https://elsewhere.example.org/start', app)).toBe('https://elsewhere.example.org/start');
    expect(carriedHref('mailto:someone@example.com', app)).toBe('mailto:someone@example.com');
    expect(carriedHref('not a link', app)).toBe('not a link');
  });

  it('uses what the server worked out when the link had no tags, and nothing before any visit', () => {
    expect(carriedHref(`${app}/start`, app)).toBe(`${app}/start`);
    beginVisit({ path: '/', search: '', referrer: 'https://www.google.co.uk/', navigation: 'navigate', ownHosts });
    expect(carriedHref(`${app}/start`, app)).toBe(`${app}/start`);
    learnTags({ source: 'google', medium: 'search', campaign: null });
    expect(carriedHref(`${app}/start`, app)).toBe(`${app}/start?utm_source=google&utm_medium=search`);
  });
});
