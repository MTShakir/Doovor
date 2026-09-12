import { describe, expect, it } from 'vitest';
import { defaultLabelFor, pickupKinds, pickupPointSchema } from './pickup.ts';

const valid = {
  kind: 'home' as const,
  label: 'Home',
  address: '12 Hyde Park Road, Leeds',
  postcode: 'ls6 1ab',
  isDefault: true,
};

function problem(input: Record<string, unknown>): string[] {
  const result = pickupPointSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('pickup points (COV-04, M1-16)', () => {
  it('takes an address and tidies the postcode', () => {
    expect(pickupPointSchema.parse(valid)).toEqual({ ...valid, postcode: 'LS6 1AB' });
  });

  it('needs an address and a postcode that is one', () => {
    expect(problem({ ...valid, address: '   ' })).toEqual(['address']);
    expect(problem({ ...valid, postcode: 'Leeds' })).toEqual(['postcode']);
  });

  it('lets the label be empty, because the kind already names it', () => {
    expect(pickupPointSchema.parse({ ...valid, label: '' }).label).toBe('');
    expect(defaultLabelFor('school')).toBe('School or college');
    expect(defaultLabelFor('custom')).toBe('Somewhere else');
  });

  it('offers the four kinds the product names', () => {
    expect(pickupKinds.map((kind) => kind.value)).toEqual(['home', 'school', 'work', 'custom']);
  });

  it('refuses a kind that is not one of them', () => {
    expect(problem({ ...valid, kind: 'moon' })).toEqual(['kind']);
  });
});
