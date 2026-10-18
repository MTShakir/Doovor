import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { monthlyExecutions, runsPerDay, schedules } from './schedules';

describe('the scheduled jobs, on the free plan (D-271)', () => {
  it('counts what a schedule costs in a day', () => {
    expect(runsPerDay('* * * * *')).toBe(1440);
    expect(runsPerDay('*/5 * * * *')).toBe(288);
    expect(runsPerDay('TZ=Europe/London */15 * * * *')).toBe(96);
    expect(runsPerDay('TZ=Europe/London 0 8 * * *')).toBe(1);
  });

  it('leaves a fifth of a long month for what follows something somebody did', () => {
    const scheduled = Object.values(schedules).reduce((sum, schedule) => sum + runsPerDay(schedule), 0) * 31;
    // Bookings, payments and badges run jobs of their own, and those grow with the business.
    expect(scheduled).toBeLessThan(monthlyExecutions * 0.8);
  });

  it('is the only place a job is given a schedule, so nothing escapes the count', () => {
    const folder = join(import.meta.dirname, 'functions');
    const written = readdirSync(folder)
      .filter((file) => file.endsWith('.ts'))
      .filter((file) => /cron\(\s*['"`]/.test(readFileSync(join(folder, file), 'utf8')));
    expect(written).toEqual([]);
  });
});
