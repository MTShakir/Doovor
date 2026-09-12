import { serve } from 'inngest/next';
import { functions } from '@/jobs';
import { inngest } from '@/jobs/client';

/** The job runner calls this endpoint. It verifies its own signature (INNGEST_SIGNING_KEY). */
export const { GET, POST, PUT } = serve({ client: inngest, functions });
