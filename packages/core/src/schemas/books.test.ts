import { describe, expect, it } from 'vitest';
import { vehicleInputSchema } from './books.ts';

const yaris = { make: 'Toyota', model: 'Yaris', year: '2020', registration: 'ab12 cde', dualControls: 'yes' as const };

function problem(input: Record<string, unknown>): Record<string, string> {
  const result = vehicleInputSchema.safeParse(input);
  if (result.success) return {};
  return Object.fromEntries(result.error.issues.map((issue) => [issue.path.join('.'), issue.message]));
}

describe('a car (MNY-03, D-199, D-256)', () => {
  it('takes what the car is, and whether it has dual controls', () => {
    expect(vehicleInputSchema.parse(yaris)).toEqual({
      make: 'Toyota',
      model: 'Yaris',
      year: 2020,
      registration: 'AB12CDE',
      dualControls: true,
    });
    expect(vehicleInputSchema.parse({ ...yaris, dualControls: 'no' }).dualControls).toBe(false);
  });

  it('needs only the make and the dual controls answer', () => {
    expect(vehicleInputSchema.parse({ make: 'Ford', dualControls: 'no' })).toEqual({
      make: 'Ford',
      model: '',
      year: null,
      registration: null,
      dualControls: false,
    });
  });

  it('asks about dual controls rather than guessing, because the answer decides how the car is claimed', () => {
    const asked = 'Say whether it has dual controls';
    expect(problem({ make: 'Ford' })).toEqual({ dualControls: asked });
    expect(problem({ make: 'Ford', dualControls: null })).toEqual({ dualControls: asked });
    expect(problem({ make: 'Ford', dualControls: 'maybe' })).toEqual({ dualControls: asked });
  });

  it('refuses a car with no make, a year that is not one, and a plate that is not one', () => {
    expect(problem({ ...yaris, make: '  ' })).toEqual({ make: 'Enter the make, like Toyota' });
    expect(problem({ ...yaris, year: '20' })).toEqual({ year: 'Enter a year like 2020' });
    expect(problem({ ...yaris, registration: 'NOT A PLATE' })).toEqual({ registration: 'Enter a registration like AB12 CDE' });
  });
});
