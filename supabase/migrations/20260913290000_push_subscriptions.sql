-- Web push (NTF-01, M2-29).
--
-- A subscription is a browser saying "send here". It belongs to the person, like the rest of
-- their account, so they manage it themselves through row-level security; the job that sends
-- reads it through a system function, the way every job reads.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The push service's own URL for this browser. One row per browser.
  endpoint text not null unique check (char_length(endpoint) between 20 and 1000),
  -- The keys the payload is encrypted with. Useless to anybody but that browser.
  p256dh text not null check (char_length(p256dh) between 10 and 200),
  auth text not null check (char_length(auth) between 10 and 100),
  /** What it is, so somebody can tell their phone from their laptop when they revoke one. */
  user_agent text check (user_agent is null or char_length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

alter table public.push_subscriptions enable row level security;

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

create policy push_subscriptions_own on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.push_subscriptions from authenticated, anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

/** Where to send a push for one person. */
create or replace function public.system_push_targets(p_user_id uuid)
returns table (id uuid, endpoint text, p256dh text, auth text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.endpoint, s.p256dh, s.auth
    from public.push_subscriptions s
   where s.user_id = p_user_id;
$$;

/**
 * A browser that has gone: the push service answers 404 or 410 for a subscription somebody
 * revoked or a browser that was wiped. Keeping it means retrying for ever.
 */
create or replace function public.system_drop_push_target(p_id uuid)
returns integer
language sql
security definer
set search_path = ''
as $$
  with gone as (
    delete from public.push_subscriptions where id = p_id returning 1
  )
  select count(*)::int from gone;
$$;

create or replace function public.system_touch_push_target(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.push_subscriptions set last_used_at = now() where id = p_id;
$$;

revoke all on function public.system_push_targets(uuid) from public, anon, authenticated;
revoke all on function public.system_drop_push_target(uuid) from public, anon, authenticated;
revoke all on function public.system_touch_push_target(uuid) from public, anon, authenticated;
grant execute on function public.system_push_targets(uuid) to service_role;
grant execute on function public.system_drop_push_target(uuid) to service_role;
grant execute on function public.system_touch_push_target(uuid) to service_role;
