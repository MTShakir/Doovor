import { describe, expect, it } from 'vitest';
import { isBuildAsset, isKeptOffline } from './offline-pages';

describe('what is kept on the device for no signal (PRD 8.1, M4-08)', () => {
  it('keeps Today and a lesson\'s own screen', () => {
    expect(isKeptOffline('/app/instructor')).toBe(true);
    expect(isKeptOffline('/app/instructor/lessons/6f1c8b52-3a6e-4d1f-9b1e-2f4c5d6e7f80')).toBe(true);
  });

  it('keeps nothing else anybody reads, however close it looks', () => {
    for (const path of [
      '/app/instructor/',
      '/app/instructor/diary',
      '/app/instructor/learners/6f1c8b52-3a6e-4d1f-9b1e-2f4c5d6e7f80',
      '/app/instructor/lessons/not-a-lesson',
      '/app/instructor/lessons/6f1c8b52-3a6e-4d1f-9b1e-2f4c5d6e7f80/extra',
      '/app/learner',
      '/app/learner/progress',
      '/account',
      '/sign-in',
    ]) {
      expect(isKeptOffline(path), path).toBe(false);
    }
  });

  it('knows the build\'s own files from everything else', () => {
    expect(isBuildAsset('/_next/static/chunks/app-1a2b3c.js')).toBe(true);
    expect(isBuildAsset('/_next/image?url=%2Fphoto.png')).toBe(false);
    expect(isBuildAsset('/api/v1/lesson-records')).toBe(false);
  });
});
