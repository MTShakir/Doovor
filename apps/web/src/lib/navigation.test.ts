import { describe, expect, it } from 'vitest';
import { hrefFor, isActive, navFor, sectionsFor } from './navigation';

describe('portal navigation (PRD 8.2)', () => {
  it('gives the instructor five mobile tabs', () => {
    expect(navFor('instructor', 'mobile').map((i) => i.label)).toEqual(['Today', 'Diary', 'Learners', 'Money', 'More']);
  });

  it('gives the learner four mobile tabs and adds Payments on desktop', () => {
    expect(navFor('learner', 'mobile').map((i) => i.label)).toEqual(['Home', 'Lessons', 'Progress', 'Account']);
    expect(navFor('learner', 'desktop').map((i) => i.label)).toContain('Payments');
  });

  it('hides Phase 2 destinations in Phase 1', () => {
    expect(navFor('instructor', 'desktop').map((i) => i.label)).not.toContain('Waiting list');
    expect(navFor('school', 'desktop').map((i) => i.label)).not.toContain('Fleet');
    expect(sectionsFor('admin')).not.toContain('reviews');
  });

  it('keeps admin off mobile', () => {
    expect(navFor('admin', 'mobile')).toHaveLength(0);
  });

  it('builds hrefs and marks the active item', () => {
    expect(hrefFor('instructor', '')).toBe('/app/instructor');
    expect(hrefFor('school', 'diary')).toBe('/app/school/diary');
    expect(isActive('instructor', '', '/app/instructor')).toBe(true);
    expect(isActive('instructor', '', '/app/instructor/diary')).toBe(false);
    expect(isActive('instructor', 'diary', '/app/instructor/diary/week')).toBe(true);
  });
});
