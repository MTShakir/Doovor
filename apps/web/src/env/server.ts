import 'server-only';
import { describeEnvError, serverEnvSchema } from './schema';

const parsed = serverEnvSchema.safeParse(process.env);

if (!parsed.success) throw new Error(describeEnvError(parsed.error));

/** Server-only configuration. Never import this from a Client Component. */
export const serverEnv = parsed.data;
