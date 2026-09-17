-- Regions: supply and demand in each postcode area against the switch-on rule, and opening or
-- closing the learner marketplace there (ADM-04, PRD 4.2, M5-19).
--
-- The marketplace opens in a postcode area once enough verified instructors cover it with enough
-- free hours in the next 14 days (the rule is in the platform settings). Platform staff see each
-- area where anything is happening: the instructors search may show who cover it, by where they are
-- based or a district they add, their free hours, and the learners waiting there or with a lesson
-- request. A super admin opens an area that meets the rule, and closes one, both audited. Opening an
-- area emails everybody waiting there once, as their consent promised (D-117); somebody told leaves
-- the waiting list, whose job is done, and a lesson request stays (D-127).

alter table public.area_waiting_list add column told_open_at timestamptz;
alter table public.lesson_requests add column told_open_at timestamptz;

/** "LS" from "LS6 3QS" or "LS6": a postcode area is the letters a postcode starts with. */
create or replace function private.postcode_area(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select substring(upper(btrim(coalesce(p_text, ''))) from '^[A-Z]{1,2}(?=[0-9])');
$$;

/**
 * Every postcode area where anything is happening, at a given moment (ADM-04, PRD 4.2, D-127):
 *
 *   instructors:  instructors search may show (checked, badge in date, listed, at a Business in good
 *                 standing) who cover the area: based in it, or adding a district in it.
 *   free_minutes: their open time in the next 14 days (working hours and extra hours, less time off)
 *                 that no lesson or its buffer takes.
 *   waiting:      people on the area's waiting list.
 *   requests:     open lesson requests there.
 *   open:         whether the marketplace is open there.
 *
 * With the switch-on rule from the platform settings.
 */
create or replace function private.region_facts(p_now timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with rule as (
    select coalesce((s.value ->> 'verified_instructors')::integer, 25) as instructors,
           coalesce((s.value ->> 'open_hours_14_days')::integer, 150) as hours
      from (select 1) as one
      left join public.platform_settings s on s.key = 'marketplace_switch_on'
  ),
  window_range as (
    select tstzrange(p_now, p_now + interval '14 days', '[)') as period,
           (p_now at time zone 'Europe/London')::date as first_day,
           ((p_now + interval '14 days') at time zone 'Europe/London')::date as last_day
  ),
  days as (
    select day::date as day
      from window_range w
      cross join generate_series(w.first_day, w.last_day, interval '1 day') as day
  ),
  searchable as (
    select p.id, p.base_postcode
      from public.instructor_profiles p
      join public.memberships m on m.business_id = p.business_id and m.user_id = p.user_id and m.status = 'active'
      join public.businesses b on b.id = p.business_id and b.status = 'active'
     where p.verification_status = 'approved'
       and p.is_listed
       and (p.badge_expiry is null or p.badge_expiry >= (p_now at time zone 'Europe/London')::date)
  ),
  covers as (
    select s.id, private.postcode_area(s.base_postcode) as area
      from searchable s
     where private.postcode_area(s.base_postcode) is not null
    union
    select s.id, private.postcode_area(d.outcode)
      from searchable s
      join public.coverage_districts d on d.instructor_id = s.id and d.rule = 'include'
     where private.postcode_area(d.outcode) is not null
  ),
  free as (
    select s.id,
           (select coalesce(sum(extract(epoch from upper(r) - lower(r))), 0) / 60
              from unnest(
                ((
                   coalesce((
                     select range_agg(open_range.period)
                       from (
                         select tstzrange((d.day + wh.start_time) at time zone 'Europe/London',
                                          (d.day + wh.end_time) at time zone 'Europe/London', '[)') as period
                           from days d
                           join public.working_hours wh on wh.instructor_id = s.id and wh.weekday = extract(isodow from d.day)
                         union all
                         select e.period
                           from public.availability_exceptions e
                          where e.instructor_id = s.id and e.kind = 'open' and e.period && w.period
                       ) as open_range
                   ), '{}'::tstzmultirange)
                   - coalesce((
                       select range_agg(e.period)
                         from public.availability_exceptions e
                        where e.instructor_id = s.id and e.kind = 'blocked' and e.period && w.period
                     ), '{}'::tstzmultirange)
                 ) * tstzmultirange(w.period))
                 - coalesce((
                     select range_agg(k.blocked_range)
                       from public.bookings k
                      where k.instructor_id = s.id
                        and k.status in ('pending_payment', 'requested', 'confirmed', 'in_progress', 'completed')
                        and (k.status <> 'requested' or k.expires_at > p_now)
                        and k.blocked_range && w.period
                   ), '{}'::tstzmultirange)
              ) as r
           )::integer as minutes
      from searchable s
      cross join window_range w
  ),
  supply as (
    select c.area, count(*)::integer as instructors, coalesce(sum(f.minutes), 0)::integer as free_minutes
      from covers c
      join free f on f.id = c.id
     group by c.area
  ),
  waiting as (
    select w.postcode_area as area, count(distinct lower(w.email))::integer as waiting
      from public.area_waiting_list w
     where w.left_at is null
     group by w.postcode_area
  ),
  requests as (
    select r.postcode_area as area, count(*)::integer as requests
      from public.lesson_requests r
     where r.withdrawn_at is null
     group by r.postcode_area
  ),
  areas as (
    select area from supply
    union select area from waiting
    union select area from requests
    union select postcode_area from public.marketplace_regions
  )
  select jsonb_build_object(
    'rule', (select jsonb_build_object('instructors', r.instructors, 'hours', r.hours) from rule r),
    'regions', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'area', a.area,
                 'instructors', coalesce(s.instructors, 0),
                 'free_minutes', coalesce(s.free_minutes, 0),
                 'waiting', coalesce(w.waiting, 0),
                 'requests', coalesce(q.requests, 0),
                 'open', coalesce(m.marketplace_enabled, false),
                 'switched_at', m.switched_at
               )
               order by a.area
             )
        from areas a
        left join supply s on s.area = a.area
        left join waiting w on w.area = a.area
        left join requests q on q.area = a.area
        left join public.marketplace_regions m on m.postcode_area = a.area
    ), '[]'::jsonb)
  );
$$;

revoke all on function private.region_facts(timestamptz) from public, anon, authenticated;

/** The regions now, for platform staff past their second step (ADM-04, AUTH-08). */
create or replace function public.admin_regions()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not private.auth_is_staff() then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  return private.region_facts(now());
end;
$$;

revoke all on function public.admin_regions() from public, anon;
grant execute on function public.admin_regions() to authenticated;

/**
 * A super admin past their second step opens the learner marketplace in a postcode area that meets
 * the switch-on rule, or closes it (ADM-04, PRD 4.2, 6.2, D-127). Audited with how the area looked,
 * and opening tells the people waiting there (D-117).
 */
create or replace function public.admin_set_marketplace_region(p_area text, p_open boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_area text := upper(btrim(coalesce(p_area, '')));
  v_facts jsonb;
  v_region jsonb;
  v_is_open boolean;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not private.auth_is_staff('super') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if v_area !~ '^[A-Z]{1,2}$' or p_open is null then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "area"}';
  end if;

  -- One change to an area at a time.
  perform pg_advisory_xact_lock(hashtext('marketplace_region:' || v_area));
  select coalesce((select r.marketplace_enabled from public.marketplace_regions r where r.postcode_area = v_area), false) into v_is_open;

  v_facts := private.region_facts(now());
  v_region := coalesce(
    (select r from jsonb_array_elements(v_facts -> 'regions') as r where r ->> 'area' = v_area),
    jsonb_build_object('area', v_area, 'instructors', 0, 'free_minutes', 0, 'waiting', 0, 'requests', 0)
  );

  if p_open then
    if v_is_open then
      raise exception 'VALIDATION_FAILED' using detail = '{"reason": "already_open"}';
    end if;
    if (v_region ->> 'instructors')::integer < (v_facts -> 'rule' ->> 'instructors')::integer
       or (v_region ->> 'free_minutes')::integer < (v_facts -> 'rule' ->> 'hours')::integer * 60 then
      raise exception 'VALIDATION_FAILED' using detail = jsonb_build_object('reason', 'below_rule')::text;
    end if;

    insert into public.marketplace_regions (postcode_area, marketplace_enabled, switched_at)
    values (v_area, true, now())
    on conflict (postcode_area) do update set marketplace_enabled = true, switched_at = now();

    perform private.write_audit('region.marketplace_opened', 'marketplace_region', null, null,
      jsonb_build_object('area', v_area, 'open', false),
      jsonb_build_object('area', v_area, 'open', true, 'instructors', v_region -> 'instructors',
                         'free_minutes', v_region -> 'free_minutes', 'waiting', v_region -> 'waiting', 'requests', v_region -> 'requests'));
    perform private.enqueue_event('marketplace_region.opened', jsonb_build_object('area', v_area));
  else
    if not v_is_open then
      raise exception 'VALIDATION_FAILED' using detail = '{"reason": "not_open"}';
    end if;

    update public.marketplace_regions set marketplace_enabled = false, switched_at = now() where postcode_area = v_area;
    perform private.write_audit('region.marketplace_closed', 'marketplace_region', null, null,
      jsonb_build_object('area', v_area, 'open', true),
      jsonb_build_object('area', v_area, 'open', false, 'instructors', v_region -> 'instructors', 'free_minutes', v_region -> 'free_minutes'));
  end if;
end;
$$;

revoke all on function public.admin_set_marketplace_region(text, boolean) from public, anon;
grant execute on function public.admin_set_marketplace_region(text, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------
-- Telling the people waiting in an area that has opened, once each (D-117).
-- ---------------------------------------------------------------------------------------

/**
 * For the job that emails them: each address still on the area's waiting list or with an open
 * lesson request there, not yet told, with the token of what they left, while the area is open.
 */
create or replace function public.system_region_opened_recipients(p_area text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with area as (
    select upper(btrim(p_area)) as code
     where exists (
       select 1 from public.marketplace_regions r
        where r.postcode_area = upper(btrim(p_area)) and r.marketplace_enabled
     )
  ),
  people as (
    select lower(w.email) as address, w.email, w.full_name, w.token, 'waiting_list' as kind, w.created_at
      from public.area_waiting_list w
      join area a on a.code = w.postcode_area
     where w.left_at is null and w.told_open_at is null
    union all
    select lower(r.email), r.email, r.full_name, r.token, 'lesson_request', r.created_at
      from public.lesson_requests r
      join area a on a.code = r.postcode_area
     where r.withdrawn_at is null and r.told_open_at is null
  ),
  -- One email to an address, about its place on the list when it has one.
  one_each as (
    select distinct on (p.address) p.email, p.full_name, p.token, p.kind
      from people p
     order by p.address, case p.kind when 'waiting_list' then 0 else 1 end, p.created_at
  )
  select coalesce(
    jsonb_agg(jsonb_build_object('email', o.email, 'fullName', o.full_name, 'token', o.token, 'kind', o.kind) order by o.email),
    '[]'::jsonb
  )
    from one_each o;
$$;

/** An address told that its area has opened: off the waiting list, and its lesson request marked. */
create or replace function public.system_mark_told_region_open(p_area text, p_email text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.area_waiting_list
     set told_open_at = now(), left_at = coalesce(left_at, now())
   where postcode_area = upper(btrim(p_area)) and lower(email) = lower(btrim(p_email)) and told_open_at is null;
  update public.lesson_requests
     set told_open_at = now()
   where postcode_area = upper(btrim(p_area)) and lower(email) = lower(btrim(p_email)) and told_open_at is null;
$$;

revoke all on function public.system_region_opened_recipients(text) from public, anon, authenticated;
revoke all on function public.system_mark_told_region_open(text, text) from public, anon, authenticated;
grant execute on function public.system_region_opened_recipients(text) to service_role;
grant execute on function public.system_mark_told_region_open(text, text) to service_role;
