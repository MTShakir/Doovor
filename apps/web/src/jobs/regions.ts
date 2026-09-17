import 'server-only';
import { regionOpenedWords } from '@repo/core/schemas/capture';
import { renderNotificationEmail } from '@repo/emails';
import { z } from 'zod';
import { emailProvider } from '@/lib/email/provider';
import { getSiteUrl } from '@/lib/site-url';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

const recipientsSchema = z.array(
  z.object({
    email: z.string(),
    fullName: z.string(),
    token: z.string(),
    kind: z.enum(['waiting_list', 'lesson_request']),
  }),
);

export interface RegionOpenedResult {
  told: number;
  /** Addresses the email provider refused, which would be refused again. */
  refused: number;
}

/**
 * Tells everybody waiting in a postcode area that the learner marketplace has opened there (ADM-04,
 * D-117, D-127): one email to an address, under a key of its own so a retry sends none twice, and
 * the address marked as told once it has gone. An address the provider refuses is marked too, since
 * it would be refused again; a provider that cannot be reached throws, so the job tries again for
 * whoever is left. The database names nobody for an area that has closed again.
 */
export async function tellRegionOpened(area: string): Promise<RegionOpenedResult> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.rpc('system_region_opened_recipients', { p_area: area });
  if (error) throw new Error(`Could not read who is waiting in ${area}: ${error.message}`);
  const recipients = recipientsSchema.parse(data);

  let told = 0;
  let refused = 0;
  for (const person of recipients) {
    const words = regionOpenedWords(person.kind, area);
    const firstName = person.fullName.trim().split(/\s+/)[0];
    const email = await renderNotificationEmail({
      title: words.title,
      body: words.body,
      greeting: firstName ? `Hello ${firstName}` : undefined,
      action: { label: words.action, url: new URL('/learners#find-an-instructor', getSiteUrl()).toString() },
      reason: words.reason,
    });

    const result = await emailProvider().send({
      to: person.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
      idempotencyKey: `region-opened:${area}:${person.email.toLowerCase()}`,
    });
    if (!result.ok && result.reason !== 'REJECTED') throw new Error(`Could not email the people waiting in ${area}: ${result.message}`);

    const marked = await supabase.rpc('system_mark_told_region_open', { p_area: area, p_email: person.email });
    if (marked.error) throw new Error(`Could not record who was told about ${area}: ${marked.error.message}`);
    if (result.ok) told += 1;
    else refused += 1;
  }
  return { told, refused };
}
