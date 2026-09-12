import type { BusinessType, DbClient, MembershipRole, PlatformRole } from './types';

export interface AccessMembership {
  businessId: string;
  businessName: string;
  businessType: BusinessType;
  role: MembershipRole;
  instructorProfileId: string | null;
  /** Onboarding progress for that profile (AUTH-04). Null when this membership is not an instructor. */
  onboarding: { step: number; completed: boolean } | null;
}

/** Everything needed to decide which portals a person can use. Read through RLS. */
export interface AccessContext {
  userId: string;
  staffRole: PlatformRole | null;
  isLearner: boolean;
  /** A learner who has answered the onboarding questions (AUTH-06). False for everyone else. */
  learnerOnboarded: boolean;
  memberships: AccessMembership[];
}

export class AccessContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccessContextError';
  }
}

/** The token is valid but its session was signed out, for example from another device (D-041). */
export class SessionEndedError extends AccessContextError {
  constructor() {
    super('This device has been signed out.');
    this.name = 'SessionEndedError';
  }
}

export async function getAccessContext(client: DbClient, userId: string): Promise<AccessContext> {
  const [staff, memberships, learner, instructors] = await Promise.all([
    client.from('platform_staff').select('role').eq('user_id', userId).maybeSingle(),
    client
      .from('memberships')
      .select('business_id, role, businesses!inner(name, type, status)')
      .eq('user_id', userId)
      .eq('status', 'active'),
    client.from('learner_profiles').select('user_id, transmission').eq('user_id', userId).maybeSingle(),
    client
      .from('instructor_profiles')
      .select('id, business_id, onboarding_step, onboarding_completed_at')
      .eq('user_id', userId),
  ]);

  const failed = [staff.error, memberships.error, learner.error, instructors.error].find(Boolean);
  if (failed?.code === 'SESSION_ENDED') throw new SessionEndedError();
  if (failed) throw new AccessContextError(failed.message);

  const profileByBusiness = new Map((instructors.data ?? []).map((p) => [p.business_id, p]));

  return {
    userId,
    staffRole: staff.data?.role ?? null,
    isLearner: learner.data !== null,
    // The row is created at sign-up; the answers are what say they have been through it.
    learnerOnboarded: typeof learner.data?.transmission === 'string',
    memberships: (memberships.data ?? [])
      .filter((m) => m.businesses.status !== 'suspended')
      .map((m) => ({
        businessId: m.business_id,
        businessName: m.businesses.name,
        businessType: m.businesses.type,
        role: m.role,
        instructorProfileId: profileByBusiness.get(m.business_id)?.id ?? null,
        onboarding: profileByBusiness.has(m.business_id)
          ? {
              step: profileByBusiness.get(m.business_id)?.onboarding_step ?? 1,
              completed: profileByBusiness.get(m.business_id)?.onboarding_completed_at !== null,
            }
          : null,
      })),
  };
}
