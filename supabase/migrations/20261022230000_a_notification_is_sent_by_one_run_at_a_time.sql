-- A notification is sent by one run at a time (NTF-01, NTF-03, D-367).
--
-- Every job that writes notifications sends what is waiting in the same run (D-271), and several
-- run at once: a booking and its payment, a day's reminders, twenty welcomes after a batch of
-- sign-ups. Claiming a notification only counted an attempt, so a row claimed by one run could be
-- claimed again by the next while the first was still sending it, and each was sent up to five
-- times. Email was saved by the provider's idempotency key; a push notification or a text message
-- was not, and each text came out of the plan's monthly allowance. A claim now holds the row for
-- ten minutes: nobody else claims it until it is sent, it fails (and is free to try again), or the
-- run that claimed it has plainly died. The outbox's events are claimed the same way.

alter table public.notifications add column claimed_at timestamptz;
alter table public.outbox_events add column claimed_at timestamptz;

comment on column public.notifications.claimed_at is
  'When a run claimed it to send, so no other run sends it too; free again after a failure or ten minutes (D-367).';
comment on column public.outbox_events.claimed_at is
  'When a run claimed it to dispatch, so no other run dispatches it too; free again after a failure or ten minutes (D-367).';

create or replace function public.system_claim_notifications(p_limit integer default 25)
returns table (
  id uuid,
  user_id uuid,
  email text,
  phone text,
  full_name text,
  business_id uuid,
  business_plan text,
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
       -- Not while another run is sending it, unless that run has plainly died (D-367).
       and (n.claimed_at is null or n.claimed_at < now() - interval '10 minutes')
     order by n.created_at
     limit greatest(coalesce(p_limit, 25), 1)
     for update skip locked
  ),
  claimed as (
    update public.notifications n
       set attempts = n.attempts + 1,
           claimed_at = now()
      from due
     where n.id = due.id
    returning n.*
  )
  select c.id, c.user_id, u.email, coalesce(u.phone, ''), u.full_name, c.business_id,
         coalesce(bu.plan::text, ''), c.kind, c.category,
         c.title, c.body, c.link, c.channels, c.dedupe_key
    from claimed c
    join public.users u on u.id = c.user_id
    left join public.businesses bu on bu.id = c.business_id;
$$;

-- A failure frees the row for the next run to try again, as before the claim held it.
create or replace function public.system_mark_notification_failed(p_id uuid, p_error text)
returns integer
language sql
security definer
set search_path = ''
as $$
  with marked as (
    update public.notifications set last_error = left(coalesce(p_error, 'unknown'), 500), claimed_at = null
     where id = p_id and sent_at is null
    returning 1
  )
  select count(*)::int from marked;
$$;

create or replace function public.system_claim_outbox_events(p_limit integer default 50)
returns setof public.outbox_events
language sql
security definer
set search_path = ''
as $$
  with due as (
    select id from public.outbox_events
     where sent_at is null
       and attempts < 10
       and (claimed_at is null or claimed_at < now() - interval '10 minutes')
     order by created_at
     limit greatest(coalesce(p_limit, 50), 1)
     for update skip locked
  )
  update public.outbox_events e
     set attempts = e.attempts + 1,
         claimed_at = now()
    from due
   where e.id = due.id
  returning e.*;
$$;

create or replace function public.system_mark_outbox_failed(p_ids uuid[], p_error text)
returns integer
language sql
security definer
set search_path = ''
as $$
  with marked as (
    update public.outbox_events set last_error = left(coalesce(p_error, 'unknown'), 500), claimed_at = null
     where id = any(coalesce(p_ids, '{}'::uuid[])) and sent_at is null
    returning 1
  )
  select count(*)::int from marked;
$$;
