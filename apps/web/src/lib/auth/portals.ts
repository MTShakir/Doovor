import type { AccessContext } from '@repo/db';
import type { Portal } from '@/lib/navigation';
import { portalRoots } from '@/lib/navigation';

/** Portals a person may use, in landing priority order (PRD 6, 8.2). */
export function availablePortals(context: AccessContext): Portal[] {
  const portals: Portal[] = [];
  if (context.staffRole) portals.push('admin');
  if (context.memberships.some((m) => m.businessType === 'school' && (m.role === 'owner' || m.role === 'manager'))) {
    portals.push('school');
  }
  if (context.memberships.some((m) => m.instructorProfileId !== null)) portals.push('instructor');
  if (context.isLearner) portals.push('learner');
  return portals;
}

export function canUsePortal(context: AccessContext, portal: Portal): boolean {
  return availablePortals(context).includes(portal);
}

/**
 * Where to send someone after sign-in. People with no role yet choose one (AUTH-03), and an
 * instructor who has not finished onboarding goes there rather than through their diary.
 */
export function landingPath(context: AccessContext): string {
  const [first] = availablePortals(context);
  if (first === 'instructor' && needsOnboarding(context)) return '/onboarding';
  return first ? portalRoots[first] : '/start';
}

/**
 * TOTP is required for platform staff and owners of schools (AUTH-08). Independent
 * instructors own a Business of one and may opt in (D-012).
 */
export function requiresMfa(context: AccessContext): boolean {
  return (
    context.staffRole !== null ||
    context.memberships.some((m) => m.businessType === 'school' && m.role === 'owner')
  );
}

/** Only relative paths inside the app are allowed as post-sign-in destinations. */
export function safeNextPath(next: string | null | undefined, fallback = '/'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  return next;
}

/** An instructor who has not finished onboarding is sent there before their diary (AUTH-04). */
export function needsOnboarding(context: AccessContext): boolean {
  const instructor = context.memberships.find((membership) => membership.onboarding !== null);
  return instructor?.onboarding ? !instructor.onboarding.completed : false;
}
