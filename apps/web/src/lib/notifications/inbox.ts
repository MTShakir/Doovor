import 'server-only';
import type { NotificationCategory, NotificationChannel } from '@repo/core/notifications';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface InboxItem {
  id: string;
  kind: string;
  category: NotificationCategory;
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  readAt: string | null;
}

/** What somebody has been told (NTF-01). Row-level security answers for them, not this. */
export async function myNotifications(limit = 50): Promise<InboxItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('notifications')
    .select('id, kind, category, title, body, link, created_at, read_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;

  return data.map((row) => ({
    id: row.id,
    kind: row.kind,
    category: row.category,
    title: row.title,
    body: row.body,
    link: row.link,
    createdAt: row.created_at,
    readAt: row.read_at,
  }));
}

/** How many are waiting, for the menu. */
export async function unreadCount(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);
  return error ? 0 : (count ?? 0);
}

/** The channels this person has switched off, by category (NTF-04). */
export async function myNotificationPreferences(): Promise<Map<NotificationCategory, NotificationChannel[]>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('category, channel, enabled')
    .eq('enabled', false);
  const off = new Map<NotificationCategory, NotificationChannel[]>();
  if (error) return off;
  for (const row of data) {
    off.set(row.category, [...(off.get(row.category) ?? []), row.channel]);
  }
  return off;
}

/** The row that takes somebody to their notifications, with how many are waiting. */
export async function notificationsMenuLink(): Promise<{ href: string; title: string; subtitle: string }> {
  const unread = await unreadCount();
  return {
    href: '/notifications',
    title: 'Notifications',
    subtitle: unread === 0 ? 'What you have been told, and what you hear about' : `${String(unread)} waiting`,
  };
}

/** How many browsers this account has asked us to push to (NTF-01). */
export async function mySubscribedBrowsers(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase.from('push_subscriptions').select('id', { count: 'exact', head: true });
  return error ? 0 : (count ?? 0);
}
