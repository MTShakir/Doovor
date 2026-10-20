import { describe, expect, it } from 'vitest';
import {
  effectivePence,
  lessonPricesSchema,
  linkedPriceGuideSchema,
  mostFor,
  packageSchema,
  penceAsTyped,
  priceRowLabel,
  priceRows,
} from './catalogue.ts';

const standard = { id: '6f1c3a52-9d8e-4b7a-8c61-2f0e9b4d7a13', name: 'Standard lesson' };
const motorway = { id: '1b2c3d4e-5f60-4718-8a9b-0c1d2e3f4a5b', name: 'Motorway lesson' };

describe('the prices of lessons (R-05, SCH-04, M5-15)', () => {
  it('offers each lesson type at the usual lengths and at any other length already priced', () => {
    const rows = priceRows([standard, motorway], [
      { lessonTypeId: standard.id, durationMinutes: 60, pricePence: 4000, instructorId: null },
      { lessonTypeId: standard.id, durationMinutes: 45, pricePence: 3100, instructorId: null },
      { lessonTypeId: motorway.id, durationMinutes: 120, pricePence: 9000, instructorId: null },
    ]);
    expect(rows.map((row) => `${row.lessonType} ${String(row.durationMinutes)} ${String(row.businessPence)}`)).toEqual([
      'Standard lesson 45 3100',
      'Standard lesson 60 4000',
      'Standard lesson 90 null',
      'Standard lesson 120 null',
      'Motorway lesson 60 null',
      'Motorway lesson 90 null',
      'Motorway lesson 120 9000',
    ]);
  });

  it('puts an instructor price beside the school price, and it wins, while other instructors prices are nobody else business', () => {
    const rows = priceRows(
      [standard],
      [
        { lessonTypeId: standard.id, durationMinutes: 60, pricePence: 4000, instructorId: null },
        { lessonTypeId: standard.id, durationMinutes: 60, pricePence: 4500, instructorId: 'ian' },
        { lessonTypeId: standard.id, durationMinutes: 90, pricePence: 9900, instructorId: 'ivy' },
        { lessonTypeId: standard.id, durationMinutes: 150, pricePence: 9000, instructorId: 'ian' },
      ],
      'ian',
    );
    expect(rows.map((row) => [row.durationMinutes, row.businessPence, row.ownPence, effectivePence(row)])).toEqual([
      [60, 4000, 4500, 4500],
      [90, null, null, null],
      [120, null, null, null],
      [150, null, 9000, 9000],
    ]);
    expect(priceRowLabel(rows[0] ?? { lessonType: '', durationMinutes: 0 })).toBe('Standard lesson, 1 hour');
  });

  it('reads prices as typed, blank meaning none, and says what is wrong', () => {
    const parsed = lessonPricesSchema.parse({
      prices: [
        { lessonTypeId: standard.id, durationMinutes: 60, price: '£42' },
        { lessonTypeId: standard.id, durationMinutes: 90, price: '' },
      ],
    });
    expect(parsed.prices.map((one) => one.price)).toEqual([4200, null]);
    const wrong = lessonPricesSchema.safeParse({ prices: [{ lessonTypeId: standard.id, durationMinutes: 60, price: '4' }] });
    expect(wrong.error?.issues[0]).toMatchObject({ path: ['prices', 0, 'price'], message: 'Enter a price between £5 and £1,000' });
    expect(lessonPricesSchema.safeParse({ prices: [{ lessonTypeId: standard.id, durationMinutes: 50, price: '40' }] }).success).toBe(false);
    expect(penceAsTyped(4200)).toBe('42');
    expect(penceAsTyped(4250)).toBe('42.50');
    expect(penceAsTyped(null)).toBe('');
  });
});

describe('packages of hours (PAY-04, SCH-04)', () => {
  it('takes the hours in half hours, the price in pounds and the days to use them in', () => {
    expect(packageSchema.parse({ packageId: null, name: ' 10 hours ', hours: '10', price: '380', expiryDays: '365', onSale: true })).toEqual({
      packageId: null,
      name: '10 hours',
      hours: 600,
      price: 38000,
      expiryDays: 365,
      onSale: true,
    });
    expect(packageSchema.parse({ packageId: standard.id, name: 'Top up', hours: '7.5', price: '285.50', expiryDays: '', onSale: false })).toMatchObject({
      hours: 450,
      price: 28550,
      expiryDays: null,
    });
  });

  it('says what to fix', () => {
    const result = packageSchema.safeParse({ packageId: null, name: '', hours: '7.25', price: '', expiryDays: '0', onSale: true });
    expect(result.error?.issues.map((issue) => [issue.path.join('.'), issue.message])).toEqual([
      ['name', 'Name the package, like 10 hours'],
      ['hours', 'Enter the hours, from 0.5 to 100, in half hours'],
      ['price', 'Enter the price of the package'],
      ['expiryDays', 'Enter the days to use the hours in, up to 1095, or leave it blank'],
    ]);
  });
});

describe('a school\'s price guide for linked instructors (M9-10, D-286)', () => {
  it('takes a recommended price and a most an hour in pounds, either of them left empty', () => {
    expect(linkedPriceGuideSchema.parse({ recommended: '40', maximum: '45.50' })).toEqual({ recommended: 4000, maximum: 4550 });
    expect(linkedPriceGuideSchema.parse({ recommended: '', maximum: '' })).toEqual({ recommended: null, maximum: null });
    expect(linkedPriceGuideSchema.parse({ recommended: '', maximum: '45' })).toEqual({ recommended: null, maximum: 4500 });
  });

  it('refuses a recommended price above the most, and a price out of range', () => {
    const above = linkedPriceGuideSchema.safeParse({ recommended: '50', maximum: '45' });
    expect(above.success).toBe(false);
    expect(above.error?.issues[0]?.path).toEqual(['recommended']);
    expect(linkedPriceGuideSchema.safeParse({ recommended: '4', maximum: '' }).success).toBe(false);
  });

  it('works out the most a lesson or package may cost, to the penny below', () => {
    expect(mostFor(60, 4500)).toBe(4500);
    expect(mostFor(90, 4500)).toBe(6750);
    expect(mostFor(600, 4500)).toBe(45000);
    expect(mostFor(45, 4333)).toBe(3249);
  });
});
