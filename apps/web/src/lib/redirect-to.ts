import type { Route } from 'next';
import { redirect } from 'next/navigation';

/**
 * redirect() for paths computed at runtime, which typed routes cannot check. Only pass
 * in-app paths that went through safeNextPath or come from our own navigation config.
 */
export function redirectTo(path: string): never {
  redirect(path as Route);
}
