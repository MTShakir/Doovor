/**
 * Static feature flag defaults. Super Admin overrides (ADM-05) are kept in the platform
 * settings under `feature_flags`, read through `flagsFromSettings`, and passed in as `overrides`.
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

/** Each flag by the name the platform settings keep it under. */
export const flagSettingNames: Readonly<Record<FlagKey, string>> = {
  appleSignIn: 'apple_sign_in',
  googleSignIn: 'google_sign_in',
  marketplace: 'marketplace',
};

/** The overrides the platform settings hold (ADM-05). Anything that is not a yes or no is left to its default. */
export function flagsFromSettings(value: unknown): FlagOverrides {
  const overrides: FlagOverrides = {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return overrides;
  const stored = value as Record<string, unknown>;
  for (const key of Object.keys(flagSettingNames) as FlagKey[]) {
    const one = stored[flagSettingNames[key]];
    if (typeof one === 'boolean') overrides[key] = one;
  }
  return overrides;
}
