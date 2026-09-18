import { Skeleton } from '@repo/ui/skeleton';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { z } from '@repo/core/zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { RemoveDetails } from './remove-details';

export const metadata: Metadata = { title: 'Your details', robots: { index: false, follow: false } };

const entriesSchema = z.object({
  entries: z.array(z.object({ kind: z.enum(['waiting_list', 'lesson_request']), postcodeArea: z.string(), active: z.boolean() })),
});

type Props = PageProps<'/your-details/[token]'>;

/**
 * Where the button in a waiting list or lesson request email leads (MKT-10, M5-10, D-117): what is
 * kept for the address the email went to, and one step to remove all of it. Removing is a button,
 * not the link itself, because mail scanners open links on their own.
 */
export default function YourDetailsPage({ params }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h1 text-black">Your details</h1>
      <Suspense fallback={<Skeleton className="h-40 w-full" />}>
        <Details params={params} />
      </Suspense>
    </div>
  );
}

async function Details({ params }: Pick<Props, 'params'>) {
  const { token } = await params;
  const valid = z.uuid().safeParse(token);
  const supabase = await createSupabaseServerClient();
  const { data } = valid.success ? await supabase.rpc('learner_capture_by_token', { p_token: valid.data }) : { data: null };
  const parsed = entriesSchema.safeParse(data);

  if (!parsed.success) {
    return <p className="text-body text-ink">This link is not one of ours. Check the email it came in, or contact us if it still does not work.</p>;
  }

  const kept = parsed.data.entries.filter((entry) => entry.active);
  if (kept.length === 0) {
    return <p className="text-body text-ink">We keep nothing for this email address now, and we will not email it about lessons again.</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-body text-ink">For the email address this link was sent to, we keep:</p>
      <ul aria-label="What we keep" className="flex flex-col gap-2">
        {kept.map((entry) => (
          <li key={`${entry.kind}-${entry.postcodeArea}`} className="rounded-input bg-grey-100 px-4 py-3 text-body text-ink">
            {entry.kind === 'waiting_list' ? `A place on the waiting list for ${entry.postcodeArea}` : `A lesson request near ${entry.postcodeArea}`}
          </li>
        ))}
      </ul>
      <RemoveDetails token={valid.success ? valid.data : ''} />
    </div>
  );
}
