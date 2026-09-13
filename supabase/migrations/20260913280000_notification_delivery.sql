-- Sending a notification on the channels it carries (NTF-01, NTF-03, M2-28).
--
-- The row already knows where it is going: the channels were decided when it was planned
-- (D-072). What is missing is the bookkeeping of actually sending it, which is the same
-- shape as the outbox: claim, try, mark. A claim counts an attempt, so something that keeps
-- failing eventually stops being claimed rather than holding up everything behind it.

alter table public.notifications
  add column attempts integer not null default 0,
  add column last_error text;

create index notifications_unsent_idx on public.notifications (created_at)
  where sent_at is null;

create or replace function public.system_claim_notifications(p_limit integer default 25)
returns table (
  id uuid,
  user_id uuid,
  email text,
  full_name text,
  kind text,
  category public.notification_category,
  title text,
  body text,
  link text,
  channels public.notification_channel[],
  dedupe_key text
)
language sql
security definer
set search_path = ''
as $$
  with due as (
    select n.id from public.notifications n
     where n.sent_at is null
       and n.attempts < 5
       -- The inbox needs no sending: it is the row itself.
       and n.channels <> '{in_app}'::public.notification_channel[]
     order by n.created_at
     limit greatest(coalesce(p_limit, 25), 1)
     for update skip locked
  ),
  claimed as (
    update public.notifications n
       set attempts = n.attempts + 1
      from due
     where n.id = due.id
    returning n.*
  )
  select c.id, c.user_id, u.email, u.full_name, c.kind, c.category, c.title, c.body, c.link,
         c.channels, c.dedupe_key
    from claimed c
    join public.users u on u.id = c.user_id;
$$;

create or replace function public.system_mark_notifications_sent(p_ids uuid[])
returns integer
language sql
security definer
set search_path = ''
as $$
  with marked as (
    update public.notifications set sent_at = now(), last_error = null
     where id = any(coalesce(p_ids, '{}'::uuid[])) and sent_at is null
    returning 1
  )
  select count(*)::int from marked;
$$;

create or replace function public.system_mark_notification_failed(p_id uuid, p_error text)
returns integer
language sql
security definer
set search_path = ''
as $$
  with marked as (
    update public.notifications set last_error = left(coalesce(p_error, 'unknown'), 500)
     where id = p_id and sent_at is null
    returning 1
  )
  select count(*)::int from marked;
$$;

revoke all on function public.system_claim_notifications(integer) from public, anon, authenticated;
revoke all on function public.system_mark_notifications_sent(uuid[]) from public, anon, authenticated;
revoke all on function public.system_mark_notification_failed(uuid, text) from public, anon, authenticated;
grant execute on function public.system_claim_notifications(integer) to service_role;
grant execute on function public.system_mark_notifications_sent(uuid[]) to service_role;
grant execute on function public.system_mark_notification_failed(uuid, text) to service_role;
