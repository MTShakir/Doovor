import type { AccessContext, AccessMembership } from '@repo/db';

/**
 * The Business somebody may rename (D-196, D-217): one they own. `set_business_name` asks for the
 * owner role and nothing else, so this asks the same thing rather than a stricter one of its own.
 * An instructor at a school is not an owner, and a school's name is not theirs to change.
 */
export function ownBusiness(access: AccessContext): AccessMembership | null {
  return access.memberships.find((one) => one.role === 'owner') ?? null;
}

/** The Business somebody belongs to, whether or not it is theirs: what the account screen names. */
export function myBusiness(access: AccessContext): AccessMembership | null {
  return access.memberships[0] ?? null;
}

/** What to call that name on a screen: a school has a school's name, everybody else a business's. */
export function businessNameLabel(membership: AccessMembership): string {
  return membership.businessType === 'school' ? 'Your school name' : 'Your business name';
}
