import { describe, expect, it } from 'vitest';
import {
  formatRegistration,
  isUkRegistration,
  isVehicleYear,
  normaliseRegistration,
  oldestVehicleYear,
  vehicleName,
} from './vehicle.ts';

describe('a UK registration (MNY-03, D-199)', () => {
  it('takes the current shape, however it is typed', () => {
    for (const written of ['AB12CDE', 'ab12 cde', ' AB12  CDE ', 'AB12-CDE']) {
      expect(isUkRegistration(written)).toBe(true);
      expect(normaliseRegistration(written)).toBe('AB12CDE');
    }
  });

  it('takes the older shapes, because those cars are still taught in', () => {
    // Prefix, suffix, dateless and Northern Ireland.
    for (const plate of ['A123BCD', 'ABC123A', 'ABC1234', '1234AB', 'AAZ1234']) {
      expect(isUkRegistration(plate), plate).toBe(true);
    }
  });

  it('refuses what is not a plate at all', () => {
    for (const no of ['', 'A', 'HELLO THERE', 'AB12CDEF', '12345678901', 'AB!2CDE']) {
      expect(isUkRegistration(no), no).toBe(false);
    }
  });

  it('shows it with the space where it is painted', () => {
    expect(formatRegistration('ab12cde')).toBe('AB12 CDE');
    expect(formatRegistration('A123BCD')).toBe('A123 BCD');
    expect(formatRegistration('ABC123A')).toBe('ABC 123A');
    expect(formatRegistration('ABC1234')).toBe('ABC 1234');
  });

  it('shows anything it cannot place exactly as it was stored', () => {
    expect(formatRegistration('1234AB')).toBe('1234AB');
  });
});

describe('the year a car was built', () => {
  const now = new Date('2026-09-25T00:00:00Z');

  it('allows next year, because plates arrive before the year does', () => {
    expect(isVehicleYear(2027, now)).toBe(true);
    expect(isVehicleYear(2028, now)).toBe(false);
  });

  it('allows an old car but not an impossible one', () => {
    expect(isVehicleYear(oldestVehicleYear, now)).toBe(true);
    expect(isVehicleYear(oldestVehicleYear - 1, now)).toBe(false);
    expect(isVehicleYear(2020.5, now)).toBe(false);
  });
});

describe('what to call a car', () => {
  it('uses the make and model when there is one', () => {
    expect(vehicleName({ make: 'Toyota', model: 'Yaris', registration: 'AB12CDE' })).toBe('Toyota Yaris');
    expect(vehicleName({ make: 'Toyota', model: null, registration: null })).toBe('Toyota');
  });

  it('keeps the name a car was given before make and model were asked for', () => {
    expect(vehicleName({ make: null, model: null, name: 'The Corsa', registration: 'AB12CDE' })).toBe('The Corsa');
    // Make and model win once they are there.
    expect(vehicleName({ make: 'Toyota', model: 'Yaris', name: 'The Corsa' })).toBe('Toyota Yaris');
  });

  it('falls back to the plate, and then to something rather than nothing', () => {
    expect(vehicleName({ make: '', model: '', registration: 'ab12cde' })).toBe('AB12 CDE');
    expect(vehicleName({})).toBe('A car');
  });
});
