import { brand } from '@repo/config/brand';
import { describe, expect, it } from 'vitest';
import { hostRedirect } from './hosts';

const site = brand.domain;
const app = brand.appHost;

describe('which host a request belongs on (D-084)', () => {
  it('sends an app address opened on the public site to the app, for good, path and query kept', () => {
    expect(hostRedirect(site, '/app/learner/lessons', '?view=past')).toEqual({
      url: `${brand.appUrl}/app/learner/lessons?view=past`,
      permanent: true,
    });
    expect(hostRedirect(`www.${site}`, '/book/sarah-khan', '')).toEqual({
      url: `${brand.appUrl}/book/sarah-khan`,
      permanent: true,
    });
    expect(hostRedirect(site.toUpperCase(), '/sign-in', '')?.url).toBe(`${brand.appUrl}/sign-in`);
  });

  it('leaves the public site its own pages', () => {
    expect(hostRedirect(site, '/', '')).toBeNull();
    expect(hostRedirect(`${site}:443`, '/', '')).toBeNull();
  });

  it('sends the app’s bare root to getting started, which knows where somebody signed in belongs', () => {
    expect(hostRedirect(app, '/', '?from=email')).toEqual({ url: `${brand.appUrl}/start?from=email`, permanent: false });
  });

  it('leaves every app page, and every other host, alone', () => {
    expect(hostRedirect(app, '/app/instructor', '')).toBeNull();
    expect(hostRedirect('localhost:3000', '/app/instructor', '')).toBeNull();
    expect(hostRedirect('web-git-m3-payments.vercel.app', '/', '')).toBeNull();
    expect(hostRedirect(null, '/app', '')).toBeNull();
  });
});
