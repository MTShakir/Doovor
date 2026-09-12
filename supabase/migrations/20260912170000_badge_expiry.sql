-- Badge expiry reminders and what happens when one runs out (INS-03, M1-13).
--
-- A reminder is recorded before it is sent, and the record is what stops it being sent twice:
-- a job that is retried, or runs twice in a day, finds the row already there and does nothing.

create table public.badge_reminders (
  instructor_id uuid not null references public.instructor_profiles (id) on delete cascade,
  /** 60, 30 or 7. The milestone, not the days left when it went out. */
  days_before smallint not null check (days_before in (60, 30, 7)),
  /** The expiry the reminder was about, so a renewed badge starts a fresh set. */
  badge_expiry date not null,
  created_at timestamptz not null default now(),
  primary key (instructor_id, badge_expiry, days_before)
);

alter table public.badge_reminders enable row level security;

-- Jobs only. Nobody reads or writes this through the API.
create policy badge_reminders_no_api_access on public.badge_reminders
  for all to authenticated, anon using (false) with check (false);

-- ---------------------------------------------------------------------------------------
-- system_claim_badge_reminders: what to warn about today, claimed so it goes out once.
-- ---------------------------------------------------------------------------------------
create or replace function public.system_claim_badge_reminders(p_today date default current_date)
returns table (instructor_id uuid, business_id uuid, badge_expiry date, days_before smallint, days_left integer)
language sql
security definer
set search_path = ''
as $$
  with due as (
    select p.id,
           p.business_id,
           p.badge_expiry,
           (p.badge_expiry - p_today)::integer as days_left,
           -- Nearest milestone first, so five days left is the seven-day warning.
           (case
              when p.badge_expiry - p_today <= 7 then 7
              when p.badge_expiry - p_today <= 30 then 30
              else 60
            end)::smallint as milestone
      from public.instructor_profiles p
     where p.badge_expiry is not null
       and p.badge_expiry >= p_today
       and p.badge_expiry - p_today <= 60
  ),
  claimed as (
    insert into public.badge_reminders (instructor_id, badge_expiry, days_before)
    select id, badge_expiry, milestone from due
    on conflict (instructor_id, badge_expiry, days_before) do nothing
    returning instructor_id, badge_expiry, days_before
  )
  select c.instructor_id, d.business_id, c.badge_expiry, c.days_before, d.days_left
    from claimed c
    join due d on d.id = c.instructor_id;
$$;

-- ---------------------------------------------------------------------------------------
-- system_unlist_expired_badges: an expired badge takes the profile out of search (INS-03).
-- ---------------------------------------------------------------------------------------
create or replace function public.system_unlist_expired_badges(p_today date default current_date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    update public.instructor_profiles
       set is_listed = false
     where badge_expiry is not null
       and badge_expiry < p_today
       and is_listed
    returning id, business_id, badge_expiry
  loop
    v_count := v_count + 1;
    perform private.write_audit(
      'instructor.unlisted_badge_expired', 'instructor_profile', v_row.id, v_row.business_id, null,
      jsonb_build_object('badge_expiry', v_row.badge_expiry)
    );
    perform private.enqueue_event(
      'instructor/badge-expired',
      jsonb_build_object('instructor_profile_id', v_row.id, 'business_id', v_row.business_id)
    );
  end loop;
  return v_count;
end;
$$;

revoke all on function public.system_claim_badge_reminders(date) from public, anon, authenticated;
revoke all on function public.system_unlist_expired_badges(date) from public, anon, authenticated;
grant execute on function public.system_claim_badge_reminders(date) to service_role;
grant execute on function public.system_unlist_expired_badges(date) to service_role;
