import { z } from 'zod';

/**
 * Runs in the browser before the app is interactive.
 *
 * Zod builds a validator with the Function constructor where it can, and finds out whether it can
 * by trying `Function('')`. Our content security policy refuses that in a build (NFR-SEC-03,
 * D-140), and Zod reads the schema as it goes instead, so nothing breaks. What does happen is a
 * refusal reported for every page that builds a schema, and a policy that cries wolf is one nobody
 * reads. Told here, before anything has a schema to build, it never asks.
 */
z.config({ jitless: true });
