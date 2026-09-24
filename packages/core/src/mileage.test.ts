import { describe, expect, it } from 'vitest';
import { amapRates, formatMiles, mileageBands, mileageClaimPence, tenthsFromMiles, tenthsPerMile } from './mileage.ts';

describe('claiming for business miles (MNY-03, D-198)', () => {
  it('pays 45p a mile up to ten thousand', () => {
    expect(mileageClaimPence(1 * tenthsPerMile, 2026)).toBe(45);
    expect(mileageClaimPence(100 * tenthsPerMile, 2026)).toBe(4500);
    expect(mileageClaimPence(10_000 * tenthsPerMile, 2026)).toBe(450_000);
  });

  it('and 25p after it, band by band', () => {
    // Ten thousand at 45p, then one more mile at 25p.
    expect(mileageClaimPence(10_001 * tenthsPerMile, 2026)).toBe(450_025);
    // Twelve thousand: 4,500 pounds plus 2,000 miles at 25p.
    expect(mileageClaimPence(12_000 * tenthsPerMile, 2026)).toBe(450_000 + 50_000);
  });

  it('counts part miles, and nothing for no miles at all', () => {
    expect(mileageClaimPence(75, 2026)).toBe(Math.round((75 * 45) / 10));
    expect(mileageClaimPence(0, 2026)).toBe(0);
    expect(mileageClaimPence(-40, 2026)).toBe(0);
  });

  it('uses the same rates for every year it knows of', () => {
    expect(amapRates(2023)).toEqual(amapRates(2030));
    expect(amapRates(2026).firstPence).toBe(45);
    expect(amapRates(2026).afterPence).toBe(25);
  });

  it('shows its working, one row per band', () => {
    expect(mileageBands(12_000 * tenthsPerMile, 2026)).toEqual([
      { tenths: 100_000, pencePerMile: 45, totalPence: 450_000 },
      { tenths: 20_000, pencePerMile: 25, totalPence: 50_000 },
    ]);
    expect(mileageBands(50 * tenthsPerMile, 2026)).toHaveLength(1);
    expect(mileageBands(0, 2026)).toEqual([]);
  });
});

describe('miles as somebody writes them', () => {
  it('reads whole and part miles, and refuses what is not a distance', () => {
    expect(tenthsFromMiles('12')).toBe(120);
    expect(tenthsFromMiles(' 7.5 ')).toBe(75);
    expect(tenthsFromMiles(7.46)).toBe(75);
    expect(tenthsFromMiles('0')).toBeNull();
    expect(tenthsFromMiles('-3')).toBeNull();
    expect(tenthsFromMiles('miles')).toBeNull();
    expect(tenthsFromMiles(200_000)).toBeNull();
  });

  it('writes them back the way they are read out', () => {
    expect(formatMiles(120)).toBe('12 miles');
    expect(formatMiles(75)).toBe('7.5 miles');
    expect(formatMiles(10)).toBe('1 mile');
  });
});
