import { readFileSync } from 'node:fs';
import path from 'node:path';

export const AUTH_DIR = path.join(import.meta.dirname, '..', '.auth');

interface SeedAccounts {
  password: string;
  totpSecrets: Record<string, string>;
}

/** Written by the seed (pnpm db:seed). */
export function seedAccounts(): SeedAccounts {
  return JSON.parse(readFileSync(path.join(AUTH_DIR, 'seed-accounts.json'), 'utf8')) as SeedAccounts;
}

/** One seeded account per role (packages/db/seed/data.ts). */
export const roles = {
  admin: { email: 'admin@example.com', landing: '/admin', heading: 'Dashboard' },
  support: { email: 'support@example.com', landing: '/admin', heading: 'Dashboard' },
  instructor: { email: 'sarah.khan@example.com', landing: '/app/instructor', heading: 'Today' },
  schoolOwner: { email: 'david.okafor@example.com', landing: '/app/school', heading: 'Overview' },
  schoolManager: { email: 'lucy.grant@example.com', landing: '/app/school', heading: 'Overview' },
  schoolInstructor: { email: 'emma.clarke@example.com', landing: '/app/instructor', heading: 'Today' },
  learner: { email: 'jack.taylor@example.com', landing: '/app/learner', heading: 'Home' },
} as const;

export type RoleKey = keyof typeof roles;

export function authFile(role: RoleKey): string {
  return path.join(AUTH_DIR, `${role}.json`);
}
