import { describe, expect, it } from 'vitest';
import { lessonRecordSchema } from './lesson-record.ts';

const record = {
  id: '6f1c8b52-3a6e-4d1f-9b1e-2f4c5d6e7f80',
  bookingId: '0b7e2c1a-9d4f-4a3b-8c2d-1e0f9a8b7c6d',
  ratings: [
    { skillCode: 'JUNCTIONS', rating: 3 },
    { skillCode: 'MIRRORS', rating: 4 },
  ],
  summary: '  Good junctions today  ',
};

describe('a lesson record as the phone sends it (PRG-01, M4-05)', () => {
  it('takes skills rated 1 to 5 and a line about the lesson, trimmed, with the rest optional', () => {
    expect(lessonRecordSchema.parse({ ...record, secondsTaken: 42 })).toEqual({
      ...record,
      summary: 'Good junctions today',
      nextFocus: '',
      homework: '',
      secondsTaken: 42,
    });
  });

  it('says what is missing in words the form can show', () => {
    const empty = lessonRecordSchema.safeParse({ ...record, ratings: [], summary: ' ' });
    expect(empty.success).toBe(false);
    const messages = empty.error?.issues.map((issue) => issue.message);
    expect(messages).toContain('Tap at least one skill you covered');
    expect(messages).toContain('Write a line about the lesson');
  });

  it('refuses a skill that is not on the map, a rating off the scale, and a skill rated twice', () => {
    const issues = (ratings: unknown) => lessonRecordSchema.safeParse({ ...record, ratings }).error?.issues.map((issue) => issue.message);
    expect(issues([{ skillCode: 'PARKING', rating: 3 }])).toContain('Choose a skill from the map');
    expect(issues([{ skillCode: 'CTRL', rating: 6 }])).toContain('Rate it from 1 to 5');
    expect(issues([{ skillCode: 'CTRL', rating: 2.5 }])).not.toBeUndefined();
    expect(issues([{ skillCode: 'CTRL', rating: 2 }, { skillCode: 'CTRL', rating: 4 }])).toContain('Rate each skill once');
  });

  it('needs ids made on the phone', () => {
    expect(lessonRecordSchema.safeParse({ ...record, id: 'not-an-id' }).success).toBe(false);
    expect(lessonRecordSchema.safeParse({ ...record, bookingId: undefined }).success).toBe(false);
  });
});
