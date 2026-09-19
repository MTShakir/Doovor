import { beforeEach, describe, expect, it, vi } from 'vitest';

const serverEnv = { APP_ENV: 'local' as 'local' | 'test' | 'preview' | 'production' };
vi.mock('@/env/server', () => ({ serverEnv }));

const { devRoutesOpen } = await import('./dev-routes');

beforeEach(() => {
  serverEnv.APP_ENV = 'local';
});

describe('who can reach the levers under /dev (NFR-SEC-03, M6-01, D-135)', () => {
  it('answers on a developer machine and in the test runs', () => {
    expect(devRoutesOpen()).toBe(true);
    serverEnv.APP_ENV = 'test';
    expect(devRoutesOpen()).toBe(true);
  });

  it('is not there on staging or in production, where a job runner and real providers are', () => {
    serverEnv.APP_ENV = 'preview';
    expect(devRoutesOpen()).toBe(false);
    serverEnv.APP_ENV = 'production';
    expect(devRoutesOpen()).toBe(false);
  });
});
