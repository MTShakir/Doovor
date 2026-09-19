import { z } from 'zod';

/**
 * Zod, told once what it may do here (D-140).
 *
 * Zod builds a faster validator with the Function constructor where it can, and finds out whether
 * it can by trying it as the first schema is built. In a browser our content security policy
 * refuses that (D-138), and Zod reads the schema as it goes instead, so nothing breaks; but the
 * browser reports a refusal for every page that builds a schema, and a policy that cries wolf is
 * one nobody reads. Zod's own source says as much next to the check.
 *
 * On a server there is no such policy and the faster validator is worth having, so this only
 * applies in a browser. It is set here, in the module that hands out `z`, because a schema is
 * built as its own module is read: anything that has `z` has already run this.
 *
 * Nothing else imports `zod` directly, and eslint holds that.
 */
// `window` rather than a DOM type, because this package also has to run in a phone app, where
// there is no document and no just in time compiling either.
if ('window' in globalThis) z.config({ jitless: true });

export { z };
export type { ZodError, ZodType } from 'zod';
