import { describe, expect, it } from 'vitest';
import { coverageWords, hourlyFromPence, instructorProfilePath, joinWords, qualificationWords, schoolProfilePath } from './public-profile';

describe('the public instructor profile (PUB-01, M5-02)', () => {
  it('lives under the city its base is in, and under "uk" when that is not known yet', () => {
    expect(instructorProfilePath('leeds', 'sarah-khan')).toBe('/instructors/leeds/sarah-khan');
    expect(instructorProfilePath(null, 'sarah-khan')).toBe('/instructors/uk/sarah-khan');
    expect(schoolProfilePath('manchester', 'quayside-driving-school')).toBe('/schools/manchester/quayside-driving-school');
    expect(schoolProfilePath(null, 'quayside-driving-school')).toBe('/schools/uk/quayside-driving-school');
  });

  it('says what kind of instructor somebody is, in words a learner knows', () => {
    expect(qualificationWords('adi')).toBe('Approved driving instructor');
    expect(qualificationWords('pdi')).toBe('Trainee driving instructor');
  });

  it('joins words the way a sentence does, with no comma before the last', () => {
    expect(joinWords([])).toBe('');
    expect(joinWords(['LS17'])).toBe('LS17');
    expect(joinWords(['LS17', 'LS18'])).toBe('LS17 and LS18');
    expect(joinWords(['LS17', 'LS18', 'LS19'])).toBe('LS17, LS18 and LS19');
  });

  it('says where lessons can start, by district rather than the postcode itself', () => {
    expect(coverageWords({ radiusMiles: 8, outcode: 'LS6', alsoCovers: [] })).toBe('Lessons within 8 miles of LS6.');
    expect(coverageWords({ radiusMiles: 1, outcode: 'M1', alsoCovers: ['M20', 'M21'] })).toBe(
      'Lessons within 1 mile of M1, and in M20 and M21.',
    );
    expect(coverageWords({ radiusMiles: 10, outcode: null, alsoCovers: ['M20'] })).toBe(
      'Lessons within 10 miles of their base, and in M20.',
    );
  });

  it('finds the lowest price for an hour of driving, whatever the lesson lengths', () => {
    expect(hourlyFromPence([])).toBeNull();
    // £42 an hour, and £80 for two hours is £40 an hour.
    expect(hourlyFromPence([{ durationMinutes: 60, pricePence: 4200 }, { durationMinutes: 120, pricePence: 8000 }])).toBe(4000);
    // £21.50 for 45 minutes is £28.66 and a bit an hour: rounded to the penny, never down to a price nobody offers.
    expect(hourlyFromPence([{ durationMinutes: 45, pricePence: 2150 }])).toBe(2867);
  });
});
