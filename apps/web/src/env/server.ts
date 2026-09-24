import 'server-only';
import { clientEnvSchema, describeEnvError, serverEnvSchema } from './schema';

const parsed = serverEnvSchema.safeParse(process.env);

if (!parsed.success) throw new Error(describeEnvError(parsed.error));

/**
 * The public values are checked here too, because the browser no longer does it (D-197): they are
 * inlined into the client bundle at build time, so this is the last moment a missing or malformed
 * one can be caught rather than shipped.
 */
const publicValues = clientEnvSchema.safeParse(process.env);

if (!publicValues.success) throw new Error(describeEnvError(publicValues.error));

/** Server-only configuration. Never import this from a Client Component. */
export const serverEnv = parsed.data;
