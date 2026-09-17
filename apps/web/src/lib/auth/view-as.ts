import 'server-only';
import { err, type Err } from '@repo/core/result';
import { cookies } from 'next/headers';

/**
 * Viewing as somebody else, read only (ADM-06, D-129).
 *
 * The viewing's id is kept in a cookie and sent with every database request as `x-view-as`. The id
 * is no secret: the database honours it only for the staff session that started the viewing, so it
 * is readable by the page, which sends it from the browser too.
 */
export const VIEW_AS_COOKIE = 'view_as';

/** How long a viewing lasts, as the database also has it. */
export const VIEW_AS_MINUTES = 30;

export const viewAsCookieOptions = {
  path: '/',
  sameSite: 'strict',
  secure: process.env.NODE_ENV === 'production',
  httpOnly: false,
  maxAge: VIEW_AS_MINUTES * 60,
} as const;

const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The viewing this browser names, or null. Anything that is not an id is no viewing at all. */
export async function viewingId(): Promise<string | null> {
  const value = (await cookies()).get(VIEW_AS_COOKIE)?.value;
  return value !== undefined && idPattern.test(value) ? value : null;
}

/**
 * For actions that reach outside the database, such as the payments provider, where the database's
 * read-only rule cannot stop them: nothing happens while staff are viewing as somebody.
 */
export async function refuseWhileViewing(): Promise<Err | null> {
  return (await viewingId()) === null ? null : err('READ_ONLY_SESSION');
}
