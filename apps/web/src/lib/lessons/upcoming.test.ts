import { describe, expect, it } from 'vitest';
import { upcomingCount, upcomingStep } from './upcoming';

describe('how many upcoming lessons Today shows (D-167)', () => {
  it('shows five, then five more each time', () => {
    expect(upcomingCount(undefined)).toBe(5);
    expect(upcomingCount('10')).toBe(10);
    expect(upcomingCount('15') + upcomingStep).toBe(20);
  });

  it('keeps to whole fives between five and fifty, whatever the address says', () => {
    expect(upcomingCount('7')).toBe(5);
    expect(upcomingCount('0')).toBe(5);
    expect(upcomingCount('-5')).toBe(5);
    expect(upcomingCount('many')).toBe(5);
    expect(upcomingCount('500')).toBe(50);
  });
});
