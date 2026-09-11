import type { AccessContext, AccessMembership } from '@repo/db';
import { describe, expect, it } from 'vitest';
import { availablePortals, canUsePortal, landingPath, requiresMfa, safeNextPath } from './portals';

function context(overrides: Partial<AccessContext> = {}): AccessContext {
  return { userId: 'u1', staffRole: null, isLearner: false, memberships: [], ...overrides };
}

function membership(overrides: Partial<AccessMembership>): AccessMembership {
  return {
    businessId: 'b1',
    businessName: 'Biz',
    businessType: 'independent',
    role: 'owner',
    instructorProfileId: null,
    ...overrides,
  };
}

describe('portal access', () => {
  it('sends people with no role to the role choice screen (AUTH-03)', () => {
    expect(landingPath(context())).toBe('/start');
  });

  it('lands an independent instructor on Today', () => {
    const ctx = context({ memberships: [membership({ instructorProfileId: 'p1' })] });
    expect(availablePortals(ctx)).toEqual(['instructor']);
    expect(landingPath(ctx)).toBe('/app/instructor');
  });

  it('lands school owners and managers on the school portal', () => {
    for (const role of ['owner', 'manager'] as const) {
      expect(landingPath(context({ memberships: [membership({ businessType: 'school', role })] }))).toBe('/app/school');
    }
  });

  it('gives a school instructor the instructor portal but not the school portal', () => {
    const ctx = context({ memberships: [membership({ businessType: 'school', role: 'instructor', instructorProfileId: 'p2' })] });
    expect(availablePortals(ctx)).toEqual(['instructor']);
    expect(canUsePortal(ctx, 'school')).toBe(false);
  });

  it('gives a school owner who also teaches both portals, school first', () => {
    const ctx = context({ memberships: [membership({ businessType: 'school', role: 'owner', instructorProfileId: 'p3' })] });
    expect(availablePortals(ctx)).toEqual(['school', 'instructor']);
  });

  it('lands learners on Home and staff on the admin dashboard', () => {
    expect(landingPath(context({ isLearner: true }))).toBe('/app/learner');
    expect(landingPath(context({ staffRole: 'support_admin', isLearner: true }))).toBe('/admin');
  });
});

describe('MFA requirement (AUTH-08, D-012)', () => {
  it('requires TOTP for staff and school owners', () => {
    expect(requiresMfa(context({ staffRole: 'super_admin' }))).toBe(true);
    expect(requiresMfa(context({ memberships: [membership({ businessType: 'school', role: 'owner' })] }))).toBe(true);
  });

  it('keeps it optional for independent instructors, managers and learners', () => {
    expect(requiresMfa(context({ memberships: [membership({ instructorProfileId: 'p1' })] }))).toBe(false);
    expect(requiresMfa(context({ memberships: [membership({ businessType: 'school', role: 'manager' })] }))).toBe(false);
    expect(requiresMfa(context({ isLearner: true }))).toBe(false);
  });
});

describe('safeNextPath', () => {
  it('allows in-app paths only', () => {
    expect(safeNextPath('/app/instructor/diary')).toBe('/app/instructor/diary');
    expect(safeNextPath('https://evil.example')).toBe('/');
    expect(safeNextPath('//evil.example')).toBe('/');
    expect(safeNextPath('/\\evil.example')).toBe('/');
    expect(safeNextPath(null, '/start')).toBe('/start');
  });
});
