import { describe, expect, it } from 'vitest';
import { buildFilesIn, isBuildAsset, isKeptOffline, offlineStandIn } from './offline-pages';

const lesson = '6f1c8b52-3a6e-4d1f-9b1e-2f4c5d6e7f80';
const at = (path: string) => new URL(path, 'https://app.example.com');

describe('what is kept on the device for no signal (PRD 8.1, M4-08)', () => {
  it('keeps Today, a lesson\'s own screen, and the screen that draws kept lessons', () => {
    expect(isKeptOffline('/app/instructor')).toBe(true);
    expect(isKeptOffline(`/app/instructor/lessons/${lesson}`)).toBe(true);
    expect(isKeptOffline('/app/instructor/lessons/offline')).toBe(true);
  });

  it('keeps nothing else anybody reads, however close it looks', () => {
    for (const path of [
      '/app/instructor/',
      '/app/instructor/diary',
      `/app/instructor/learners/${lesson}`,
      '/app/instructor/lessons/not-a-lesson',
      `/app/instructor/lessons/${lesson}/extra`,
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

  it('finds every build file a screen names, in its tags and in the data its components come alive from', () => {
    const html = [
      '<link rel="stylesheet" href="/_next/static/chunks/%5Broot-of-the-server%5D__1yi_q-c._.css"/>',
      '<script src="/_next/static/chunks/0zix_%40swc_helpers_cjs_0hi-e47._.js" async=""></script>',
      '<script src="/_next/static/chunks/0zix_%40swc_helpers_cjs_0hi-e47._.js" async=""></script>',
      String.raw`<script>self.__next_f.push([1,"2:I[\"[project]/kept-lesson.tsx\",[\"/_next/static/chunks/apps_web_11vm4vx._.js\",\"/_next/static/chunks/_1-1495t._.js\"],\"KeptLessonScreen\"]"])</script>`,
      '<link rel="preload" href="/_next/static/media/83afe278b6a6bb3c-s.p.woff2" as="font"/>',
      '<img src="/icons/192.png"/>',
    ].join('');
    expect(buildFilesIn(html)).toEqual([
      '/_next/static/chunks/%5Broot-of-the-server%5D__1yi_q-c._.css',
      '/_next/static/chunks/0zix_%40swc_helpers_cjs_0hi-e47._.js',
      '/_next/static/chunks/apps_web_11vm4vx._.js',
      '/_next/static/chunks/_1-1495t._.js',
      '/_next/static/media/83afe278b6a6bb3c-s.p.woff2',
    ]);
    expect(buildFilesIn('<p>Nothing here</p>')).toEqual([]);
  });
});

describe('where a screen with no signal and no kept copy goes (M4-10)', () => {
  const everything = { today: true, keptLesson: true };

  it('opens a lesson whose screen was never kept on the screen that draws kept lessons, on its record if asked', () => {
    expect(offlineStandIn(at(`/app/instructor/lessons/${lesson}`), everything)).toBe(`/app/instructor/lessons/offline?lesson=${lesson}`);
    expect(offlineStandIn(at(`/app/instructor/lessons/${lesson}?record=1`), everything)).toBe(
      `/app/instructor/lessons/offline?lesson=${lesson}&record=1`,
    );
  });

  it('opens the installed app on Today', () => {
    expect(offlineStandIn(at('/start'), everything)).toBe('/app/instructor');
    expect(offlineStandIn(at('/'), everything)).toBe('/app/instructor');
  });

  it('says there is no connection when the device has nothing to stand in, or the screen has no stand-in', () => {
    expect(offlineStandIn(at(`/app/instructor/lessons/${lesson}`), { today: true, keptLesson: false })).toBeNull();
    expect(offlineStandIn(at('/start'), { today: false, keptLesson: true })).toBeNull();
    expect(offlineStandIn(at('/app/instructor/diary'), everything)).toBeNull();
    expect(offlineStandIn(at('/app/learner'), everything)).toBeNull();
  });
});
