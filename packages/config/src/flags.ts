/**
 * Static feature flag defaults. Super Admin overrides (ADM-05) are stored in the
 * `feature_flags` table and passed in as `overrides`.
 */
export const flagDefaults = {
  /** Sign in with Apple stays hidden until Apple keys exist (product owner, 11 Sep 2026). */
  appleSignIn: false,
  googleSignIn: true,
  /** Learner marketplace search (Phase 3). Regions switch on individually (MKT-10, ADM-04). */
  marketplace: false,
} as const;

export type FlagKey = keyof typeof flagDefaults;
export type FlagOverrides = Partial<Record<FlagKey, boolean>>;

export function isFlagEnabled(key: FlagKey, overrides: FlagOverrides = {}): boolean {
  return overrides[key] ?? flagDefaults[key];
}
