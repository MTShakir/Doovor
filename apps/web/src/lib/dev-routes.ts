import 'server-only';
import { serverEnv } from '@/env/server';

/**
 * Whether the levers under `/dev` answer at all (M6-01, D-135).
 *
 * Those routes run jobs, charge lessons and finish a payments account with nobody signed in: they
 * are a developer's own machine and the end to end runs, where the whole environment is ours and
 * there is no job runner. Anywhere else, staging included, they are not there. Refusing only in
 * production left them open on staging, which has a job runner, real providers and an address
 * anybody can reach (NFR-SEC-03).
 */
export function devRoutesOpen(): boolean {
  return serverEnv.APP_ENV === 'local' || serverEnv.APP_ENV === 'test';
}
