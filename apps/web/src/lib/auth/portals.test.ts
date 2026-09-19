import type { AccessContext, AccessMembership } from '@repo/db';
import { describe, expect, it } from 'vitest';
import {
  availablePortals,
  canUsePortal,
  landingPath,
  needsLearnerOnboarding,
  needsOnboarding,
  needsSchoolOnboarding,
  portalsBesidesAdmin,
  requiresMfa,
  safeNextPath,
} from './portals';

function context(overrides: Partial<AccessContext> = {}): AccessContext {
  return { userId: 'u1', staffRole: null, isLearner: false, learnerOnboarded: true, memberships: [], suspendedBusinesses: [], ...overrides };
}

function membership(overrides: Partial<AccessMembership>): AccessMembership {
  return {
    businessId: 'b1',
    businessName: 'Biz',
    businessType: 'independent',
    role: 'owner',
    instructorProfileId: null,
    onboarding: null,
    businessOnboarded: true,
    ...overrides,
  };
}

describe('portal access', () => {
  it('sends people with no role to the role choice screen (AUTH-03)', () => {
    expect(landingPath(context())).toBe('/start');
  });

  it('tells somebody whose only Business is suspended, rather than asking them to choose a role (ADM-02)', () => {
    const ctx = context({ suspendedBusinesses: ['Asha Driving'] });
    expect(availablePortals(ctx)).toEqual([]);
    expect(landingPath(ctx)).toBe('/suspended');
    // A learner too still has their own portal.
    expect(landingPath(context({ suspendedBusinesses: ['Asha Driving'], isLearner: true }))).toBe('/app/learner');
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

  it('sends the owner or manager of a school not yet set up to set it up first (AUTH-05)', () => {
    for (const role of ['owner', 'manager'] as const) {
      const ctx = context({ memberships: [membership({ businessType: 'school', role, businessOnboarded: false })] });
      expect(needsSchoolOnboarding(ctx)).toBe(true);
      expect(landingPath(ctx)).toBe('/onboarding/school');
    }
    // An instructor at that school has their own onboarding, not the school's.
    const teacher = context({ memberships: [membership({ businessType: 'school', role: 'instructor', instructorProfileId: 'p9', businessOnboarded: false })] });
    expect(needsSchoolOnboarding(teacher)).toBe(false);
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

describe('onboarding (AUTH-04)', () => {
  it('sends an instructor who has not finished onboarding there first', () => {
    const ctx = context({
      memberships: [membership({ instructorProfileId: 'p1', onboarding: { step: 2, completed: false } })],
    });
    expect(needsOnboarding(ctx)).toBe(true);
    // One redirect, not two: signing in does not pass through the diary to get there.
    expect(landingPath(ctx)).toBe('/onboarding');
  });

  it('leaves a finished instructor alone', () => {
    const ctx = context({
      memberships: [membership({ instructorProfileId: 'p1', onboarding: { step: 5, completed: true } })],
    });
    expect(needsOnboarding(ctx)).toBe(false);
    expect(landingPath(ctx)).toBe('/app/instructor');
  });

  it('keeps a school owner who also teaches on the school portal', () => {
    const ctx = context({
      memberships: [
        membership({ businessType: 'school', role: 'owner', instructorProfileId: 'p1', onboarding: { step: 1, completed: false } }),
      ],
    });
    expect(landingPath(ctx)).toBe('/app/school');
  });

  it('does not apply to people who are not instructors', () => {
    expect(needsOnboarding(context({ isLearner: true }))).toBe(false);
  });

  it('asks a new learner the questions before their own portal (AUTH-06)', () => {
    const fresh = context({ isLearner: true, learnerOnboarded: false });
    expect(needsLearnerOnboarding(fresh)).toBe(true);
    expect(landingPath(fresh)).toBe('/onboarding/about-you');
  });

  it('leaves a learner who has answered them alone', () => {
    expect(needsLearnerOnboarding(context({ isLearner: true }))).toBe(false);
    expect(landingPath(context({ isLearner: true }))).toBe('/app/learner');
  });

  it('does not ask an instructor the learner questions', () => {
    const both = context({
      isLearner: true,
      learnerOnboarded: false,
      memberships: [membership({ instructorProfileId: 'p1', onboarding: { step: 5, completed: true } })],
    });
    expect(landingPath(both)).toBe('/app/instructor');
  });
});

describe('the way on from the admin portal on a phone (PRD 8.2)', () => {
  it('offers the other portals of somebody who is staff and more, in landing order', () => {
    const ctx = context({
      staffRole: 'super_admin',
      isLearner: true,
      memberships: [membership({ businessType: 'school', role: 'owner' }), membership({ businessId: 'b2', instructorProfileId: 'p1' })],
    });
    expect(portalsBesidesAdmin(ctx)).toEqual([
      { href: '/app/school', label: 'Open your school' },
      { href: '/app/instructor', label: 'Open your diary' },
      { href: '/app/learner', label: 'Open your lessons' },
    ]);
  });

  it('offers nothing to somebody who is staff and nothing else', () => {
    expect(portalsBesidesAdmin(context({ staffRole: 'support_admin' }))).toEqual([]);
  });
});
