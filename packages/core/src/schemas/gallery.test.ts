import { describe, expect, it } from 'vitest';
import { galleryPhotoSchema } from './gallery.ts';
import { todayInZone } from '../time/zone.ts';

const good = { imagePath: 'business/photo.webp', passedOn: '2026-01-05', learnerName: 'Jaz Hall', consent: true };

describe('adding a pass photo (D-218)', () => {
  it('takes a photo, a day and a name', () => {
    expect(galleryPhotoSchema.safeParse(good).success).toBe(true);
  });

  it('takes a learner from the list instead of a name', () => {
    const chosen = { ...good, learnerName: '', learnerId: '2f1a8b3c-7d4e-4f6a-9b0c-1d2e3f4a5b6c' };
    expect(galleryPhotoSchema.safeParse(chosen).success).toBe(true);
  });

  it('wants one of the two, because a banner with nobody on it says nothing', () => {
    const nobody = galleryPhotoSchema.safeParse({ ...good, learnerName: '   ' });
    expect(nobody.success).toBe(false);
    expect(nobody.error?.issues[0]?.message).toBe('Choose a learner, or type their name');
  });

  it('refuses a pass that has not happened yet', () => {
    const tomorrow = new Date(Date.now() + 36 * 3_600_000);
    const later = galleryPhotoSchema.safeParse({ ...good, passedOn: todayInZone(tomorrow) });
    expect(later.success).toBe(false);
    expect(later.error?.issues[0]?.message).toBe('That day has not happened yet');
  });

  it('refuses something that is not a date at all', () => {
    expect(galleryPhotoSchema.safeParse({ ...good, passedOn: 'last Tuesday' }).success).toBe(false);
  });

  it('will not take a photo without the tick, which is the whole of the consent (D-218)', () => {
    for (const consent of [false, undefined]) {
      const unasked = galleryPhotoSchema.safeParse({ ...good, consent });
      expect(unasked.success).toBe(false);
      // The same words either way: an untouched checkbox sends nothing, and "expected boolean,
      // received undefined" is not something to put in front of an instructor.
      expect(unasked.error?.issues[0]?.message).toBe('Confirm you have their permission to show this');
    }
  });

  it('wants a photo', () => {
    const empty = galleryPhotoSchema.safeParse({ ...good, imagePath: '' });
    expect(empty.success).toBe(false);
    expect(empty.error?.issues[0]?.message).toBe('Choose a photo');
  });
});
