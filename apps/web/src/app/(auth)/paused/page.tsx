import { Skeleton } from '@repo/ui/skeleton';
import { CirclePause } from 'lucide-react';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { z } from '@repo/core/zod';
import { availablePortals, landingPath } from '@/lib/auth/portals';
import { requireAccess } from '@/lib/auth/session';
import { redirectTo } from '@/lib/redirect-to';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ReopenButton } from './reopen-button';

export const metadata: Metadata = { title: 'Your business is paused' };

const pausedSchema = z.object({ businessId: z.string(), name: z.string(), pausedFor: z.string().nullable() });

/** M9-25, D-292: somebody who paused their own business to teach under a school, and has left it. */
export default function PausedPage() {
  return (
    <div className="flex flex-col gap-6">
      <span className="flex size-16 items-center justify-center rounded-full bg-white text-black">
        <CirclePause size={32} strokeWidth={1.5} aria-hidden />
      </span>
      <Suspense fallback={<Skeleton className="h-40 w-full" />}>
        <Paused />
      </Suspense>
    </div>
  );
}

async function Paused() {
  const { access } = await requireAccess();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc('my_paused_business');
  const paused = pausedSchema.safeParse(data);
  // Nothing paused, or a portal to use after all: go there instead.
  if (!paused.success || availablePortals(access).some((portal) => portal === 'instructor')) redirectTo(landingPath(access));
  const { businessId, name, pausedFor } = paused.data;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-h1 text-black">{name} is paused</h1>
      <p className="text-body text-grey-700">
        You paused it to teach under {pausedFor ?? 'a school'}. Open it again and its profile and booking link come back, with the learners
        who stayed with it.
      </p>
      <ReopenButton businessId={businessId} name={name} />
    </div>
  );
}
