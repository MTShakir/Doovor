import 'server-only';
import { brand } from '@repo/config/brand';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Everything the product holds about whoever is asking (NFR-PRV-03, M6-11, D-148).
 *
 * The database answers about the session it is given and nobody else, and writes the export to the
 * audit trail as it goes. Read through the person's own session, never the secret key.
 */
export type MyData = Record<string, unknown>;

export async function myData(): Promise<MyData | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('export_my_data');
  if (error || data === null) return null;
  return data as MyData;
}

/** What the downloaded file is called: the product, the person, and the day they asked. */
export function exportFileName(name: string, when: Date, extension: 'json'): string {
  const who = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const day = when.toISOString().slice(0, 10);
  return `${brand.shortName.toLowerCase()}-${who || 'account'}-${day}.${extension}`;
}
