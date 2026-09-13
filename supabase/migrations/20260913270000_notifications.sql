-- The notification core (NTF-01, NTF-03, NTF-04, PRD Appendix B, M2-27).
--
-- `notifications` is both the in-app inbox and the record that something went out, so a
-- person can see what they were told and when. `dedupe_key` is unique: a job that runs twice,
-- or a webhook delivered three times, writes one row (ARCHITECTURE 10).
--
-- What may be switched off lives in `notification_preferences`. A row there is a deliberate
-- choice; no row means the channel is on, so nobody has to be seeded with sixteen rows the
-- day they sign up.

create type public.notification_channel as enum ('in_app', 'email', 'push', 'sms');
create type public.notification_category as enum ('bookings', 'reminders', 'money', 'account');

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Which Business it is about, when it is about one. A learner's own account is not.
  business_id uuid references public.businesses (id) on delete cascade,
  kind text not null check (char_length(kind) between 1 and 60),
  category public.notification_category not null,
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) <= 400),
  link text check (link is null or char_length(link) <= 200),
  channels public.notification_channel[] not null default '{in_app}'::public.notification_channel[],
  entity_type text check (entity_type is null or char_length(entity_type) <= 40),
  entity_id uuid,
  -- One per person per thing per version of it, so a retry writes nothing.
  dedupe_key text not null unique,
  created_at timestamptz not null default now(),
  -- When the channels beyond the inbox were handed the message (M2-28 onwards).
  sent_at timestamptz,
  read_at timestamptz
);

alter table public.notifications enable row level security;

create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

-- Yours and nobody else's. Jobs write them through the system function below.
create policy notifications_read_own on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy notifications_mark_own on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.notifications from authenticated, anon;
grant select on public.notifications to authenticated;
-- Marking one read is the only thing a person changes about it.
grant update (read_at) on public.notifications to authenticated;

create table public.notification_preferences (
  user_id uuid not null references auth.users (id) on delete cascade,
  category public.notification_category not null,
  channel public.notification_channel not null,
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, category, channel)
);

alter table public.notification_preferences enable row level security;

create policy notification_preferences_own on public.notification_preferences
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.notification_preferences from authenticated, anon;
grant select, insert, update, delete on public.notification_preferences to authenticated;

create trigger notification_preferences_touch
  before update on public.notification_preferences
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------------------
-- What the jobs use. The secret key only ever calls these.
-- ---------------------------------------------------------------------------------------

/**
 * Writes what a job decided to send. Rows already carry their channels and their words: the
 * catalogue and the preferences are applied in packages/core, so there is one place where
 * that rule lives rather than two that can disagree.
 */
create or replace function public.system_notify(p_rows jsonb)
returns integer
language sql
security definer
set search_path = ''
as $$
  with written as (
    insert into public.notifications
      (user_id, business_id, kind, category, title, body, link, channels, entity_type, entity_id, dedupe_key)
    select (row ->> 'user_id')::uuid,
           nullif(row ->> 'business_id', '')::uuid,
           row ->> 'kind',
           (row ->> 'category')::public.notification_category,
           row ->> 'title',
           row ->> 'body',
           nullif(row ->> 'link', ''),
           coalesce(
             (select array_agg(value::text::public.notification_channel)
                from jsonb_array_elements_text(row -> 'channels') as value),
             '{in_app}'::public.notification_channel[]
           ),
           nullif(row ->> 'entity_type', ''),
           nullif(row ->> 'entity_id', '')::uuid,
           row ->> 'dedupe_key'
      from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as row
    on conflict (dedupe_key) do nothing
    returning 1
  )
  select count(*)::int from written;
$$;

/** The channels these people have switched off for one group of notifications (NTF-04). */
create or replace function public.system_notification_mutes(
  p_user_ids uuid[],
  p_category public.notification_category
)
returns table (user_id uuid, channel public.notification_channel)
language sql
stable
security definer
set search_path = ''
as $$
  select p.user_id, p.channel
    from public.notification_preferences p
   where p.user_id = any(coalesce(p_user_ids, '{}'::uuid[]))
     and p.category = p_category
     and p.enabled = false;
$$;

/**
 * Everything a job needs to write about one lesson: who is involved, when it is, and what
 * just happened to it. One query rather than five, and no tenant table read on anybody's
 * behalf: a job is nobody.
 */
create or replace function public.system_booking_notice(p_booking_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'booking_id', b.id,
    'business_id', b.business_id,
    'status', b.status::text,
    'version', b.version,
    'starts_at', b.starts_at,
    'ends_at', b.ends_at,
    'price_pence', b.price_pence,
    'fee_pence', b.fee_pence,
    'late_cancellation', coalesce(b.late_cancellation, false),
    'cancel_reason', b.cancel_reason,
    'learner_user_id', b.learner_id,
    'learner_name', l.full_name,
    'instructor_user_id', i.user_id,
    'instructor_name', i.display_name,
    'school_user_ids', coalesce(
      (select jsonb_agg(m.user_id)
         from public.memberships m
         join public.businesses bu on bu.id = m.business_id
        where m.business_id = b.business_id
          and m.status = 'active'
          and m.role in ('owner', 'manager')
          and bu.type = 'school'
          and m.user_id <> i.user_id),
      '[]'::jsonb
    )
  )
    from public.bookings b
    join public.instructor_profiles i on i.id = b.instructor_id
    join public.users l on l.id = b.learner_id
   where b.id = p_booking_id;
$$;

revoke all on function public.system_notify(jsonb) from public, anon, authenticated;
revoke all on function public.system_notification_mutes(uuid[], public.notification_category)
  from public, anon, authenticated;
revoke all on function public.system_booking_notice(uuid) from public, anon, authenticated;
grant execute on function public.system_notify(jsonb) to service_role;
grant execute on function public.system_notification_mutes(uuid[], public.notification_category) to service_role;
grant execute on function public.system_booking_notice(uuid) to service_role;
