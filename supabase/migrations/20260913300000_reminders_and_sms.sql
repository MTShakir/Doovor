-- Reminders before a lesson, and the text messages some of them go out as (NTF-02, NTF-01,
-- M2-30).
--
-- Which reminders are due is decided in packages/core, where it can be tested without a
-- clock. This says which lessons are close enough to be worth asking about, and counts the
-- text messages a Business has sent this month so the cap in the plan means something.

/**
 * Lessons starting within the next few hours, with everything a reminder needs. The job asks
 * every few minutes and works out which reminders have come due since it last looked.
 */
create or replace function public.system_due_reminders(p_within_hours integer default 26)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(notice), '[]'::jsonb)
    from (
      select jsonb_build_object(
               'booking_id', b.id,
               'business_id', b.business_id,
               'business_plan', bu.plan::text,
               'reminder_settings', bu.settings,
               'version', b.version,
               'starts_at', b.starts_at,
               'created_at', b.created_at,
               'learner_user_id', b.learner_id,
               'learner_name', l.full_name,
               'learner_phone', l.phone,
               'instructor_user_id', i.user_id,
               'instructor_name', i.display_name,
               'school_user_ids', '[]'::jsonb
             ) as notice
        from public.bookings b
        join public.instructor_profiles i on i.id = b.instructor_id
        join public.businesses bu on bu.id = b.business_id
        join public.users l on l.id = b.learner_id
       where b.status = 'confirmed'
         and b.starts_at > now()
         and b.starts_at <= now() + make_interval(hours => greatest(coalesce(p_within_hours, 26), 1))
       order by b.starts_at
       limit 500
    ) as due;
$$;

-- ---------------------------------------------------------------------------------------
-- What a Business has texted this month (NTF-01: 200 on Pro).
-- ---------------------------------------------------------------------------------------
create table public.sms_usage (
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- The first of the month it belongs to, in London, where the Business is.
  month date not null,
  sent integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (business_id, month)
);

alter table public.sms_usage enable row level security;

-- Staff can see what their own Business has used. Nobody writes it but the sending job.
create policy sms_usage_read_own on public.sms_usage
  for select to authenticated
  using (private.auth_is_member(business_id));

revoke all on public.sms_usage from authenticated, anon;
grant select on public.sms_usage to authenticated;

/**
 * Counts one text message against this month's allowance, and says whether it may be sent.
 * The count goes up first: a message that is sent and not counted is how a cap is passed.
 */
create or replace function public.system_claim_sms(p_business_id uuid, p_allowance integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month date := (date_trunc('month', (now() at time zone 'Europe/London')))::date;
  v_sent integer;
begin
  if coalesce(p_allowance, 0) <= 0 then
    return false;
  end if;

  insert into public.sms_usage (business_id, month, sent)
  values (p_business_id, v_month, 1)
  on conflict (business_id, month) do update
    set sent = public.sms_usage.sent + 1, updated_at = now()
  returning sent into v_sent;

  if v_sent > p_allowance then
    -- Over the cap: give the count back, because nothing was sent.
    update public.sms_usage set sent = sent - 1 where business_id = p_business_id and month = v_month;
    return false;
  end if;

  return true;
end;
$$;

/** Gives an allowance back when the send itself failed. */
create or replace function public.system_release_sms(p_business_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.sms_usage
     set sent = greatest(sent - 1, 0), updated_at = now()
   where business_id = p_business_id
     and month = (date_trunc('month', (now() at time zone 'Europe/London')))::date;
$$;

-- ---------------------------------------------------------------------------------------
-- The claim the sending job makes now has to say where to text, and what the plan allows.
-- ---------------------------------------------------------------------------------------
drop function if exists public.system_claim_notifications(integer);

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
  select c.id, c.user_id, u.email, coalesce(u.phone, ''), u.full_name, c.business_id,
         coalesce(bu.plan::text, ''), c.kind, c.category,
         c.title, c.body, c.link, c.channels, c.dedupe_key
    from claimed c
    join public.users u on u.id = c.user_id
    left join public.businesses bu on bu.id = c.business_id;
$$;

revoke all on function public.system_due_reminders(integer) from public, anon, authenticated;
revoke all on function public.system_claim_sms(uuid, integer) from public, anon, authenticated;
revoke all on function public.system_release_sms(uuid) from public, anon, authenticated;
revoke all on function public.system_claim_notifications(integer) from public, anon, authenticated;
grant execute on function public.system_due_reminders(integer) to service_role;
grant execute on function public.system_claim_sms(uuid, integer) to service_role;
grant execute on function public.system_release_sms(uuid) to service_role;
grant execute on function public.system_claim_notifications(integer) to service_role;
