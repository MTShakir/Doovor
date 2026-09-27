import { describe, expect, it } from 'vitest';
import { accountNameSchema } from './account.ts';

describe('what somebody can change about their own account (AUTH-09, D-217)', () => {
  it('wants a first name and takes a last name or none', () => {
    expect(accountNameSchema.safeParse({ firstName: 'Sarah', lastName: 'Khan' }).success).toBe(true);
    expect(accountNameSchema.safeParse({ firstName: 'Prince', lastName: '' }).success).toBe(true);
    const empty = accountNameSchema.safeParse({ firstName: '   ', lastName: 'Khan' });
    expect(empty.success).toBe(false);
    expect(empty.error?.issues[0]?.message).toBe('Enter your first name');
  });

  it('refuses half a name longer than the column', () => {
    const long = accountNameSchema.safeParse({ firstName: 'a'.repeat(61), lastName: 'Khan' });
    expect(long.success).toBe(false);
    expect(long.error?.issues[0]?.message).toBe('Use 60 characters or fewer');
  });

  it('takes a business name when one is sent, and is happy without', () => {
    expect(accountNameSchema.safeParse({ firstName: 'Sarah', lastName: 'Khan', businessName: 'Khan Driving' }).success).toBe(true);
    expect(accountNameSchema.safeParse({ firstName: 'Sarah', lastName: 'Khan' }).success).toBe(true);
    const blank = accountNameSchema.safeParse({ firstName: 'Sarah', lastName: 'Khan', businessName: '  ' });
    expect(blank.success).toBe(false);
    expect(blank.error?.issues[0]?.message).toBe('Enter your business name');
  });
});
