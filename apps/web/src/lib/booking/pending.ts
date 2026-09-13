import 'server-only';
import { cookies } from 'next/headers';

const PENDING = 'pending_booking';

/**
 * The slot somebody picked on a booking link before they had an account (BOK-02). Reading it
 * clears it: it is used once, to send them back to the link with the time already chosen.
 */
export async function takePendingBooking(): Promise<{ slug: string; startsAt: string } | null> {
  const jar = await cookies();
  const value = jar.get(PENDING)?.value;
  if (value === undefined) return null;
  jar.delete(PENDING);

  const [slug, startsAt] = value.split('|');
  if (slug === undefined || startsAt === undefined || slug === '' || startsAt === '') return null;
  return { slug, startsAt };
}
