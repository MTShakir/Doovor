import type { TestInfo } from '@playwright/test';

/**
 * Ofcom drama numbers, reserved one per test and per viewport (D-033).
 *
 * The two viewports run at the same time and a number can only belong to one account, so
 * every test that verifies a mobile needs its own pair. They are listed here rather than in
 * the specs so a new test cannot quietly take one that is already spoken for. Each must also
 * appear in the local stack's test codes (`[auth.sms.test_otp]` in supabase/config.toml), and
 * 900001 to 900004 belong to seeded people, so only 900005 to 900009 are free for new accounts.
 */
const reserved = {
  'sign-in-with-code': ['07700 900003', '07700 900004'],
  'verify-mobile': ['07700 900005', '07700 900006'],
  onboarding: ['07700 900007', '07700 900008'],
} as const;

export type PhoneReservation = keyof typeof reserved;

export function testNumber(testInfo: TestInfo, reservation: PhoneReservation): string {
  const [mobile, desktop] = reserved[reservation];
  return testInfo.project.name === 'mobile' ? mobile : desktop;
}
