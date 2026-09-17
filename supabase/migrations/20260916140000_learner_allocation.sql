-- Learner allocation: suggested instructors, with their reasons (SCH-03, LRN-06, M5-14).
--
-- A school giving a learner to an instructor sees who suits them best. The database gathers the
-- facts for each instructor still at the school: whether their badge is checked and in date, the
-- gearbox they teach, how far their base is from the learner, how far they travel, and their open
-- and free time over the next two weeks.
-- packages/core/src/allocation.ts puts them in order and says why (D-121). Nobody is given to an
-- instructor who has been switched off (D-120).

-- ---------------------------------------------------------------------------------------
-- assign_learner: as before (M2-10), and never to somebody switched off.
-- ---------------------------------------------------------------------------------------
create or replace function public.assign_learner(p_learner_id uuid, p_instructor_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_link public.learner_relationships;
  v_business uuid;
  v_was text;
  v_now text;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select business_id into v_business from public.instructor_profiles where id = p_instructor_id;
  if v_business is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  -- Only somebody who runs the Business moves people about in it.
  if not private.auth_has_permission(v_business, 'manage_members') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  -- Nobody is given to an instructor who has been switched off (D-120).
  if not exists (
    select 1
      from public.instructor_profiles i
      join public.memberships m on m.business_id = i.business_id and m.user_id = i.user_id and m.status = 'active'
     where i.id = p_instructor_id
  ) then
    raise exception 'INSTRUCTOR_INACTIVE';
  end if;

  select * into v_link
    from public.learner_relationships
   where learner_id = p_learner_id and business_id = v_business
   for update;
  if v_link.id is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if v_link.instructor_id = p_instructor_id then
    return v_link.id;
  end if;

  select display_name into v_was from public.instructor_profiles where id = v_link.instructor_id;
  select display_name into v_now from public.instructor_profiles where id = p_instructor_id;

  update public.learner_relationships set instructor_id = p_instructor_id where id = v_link.id;

  -- The names as they were on the day: the record should still read true after a rename.
  perform private.write_audit(
    'learner.reassigned', 'learner_relationship', v_link.id, v_business,
    jsonb_build_object('instructor_profile_id', v_link.instructor_id, 'instructor_name', v_was),
    jsonb_build_object('instructor_profile_id', p_instructor_id, 'instructor_name', v_now)
  );

  return v_link.id;
end;
$$;

/**
 * The facts for suggesting an instructor, at a given moment (D-121).
 *
 *   learner:     the gearbox they want, and their postcode district.
 *   instructors: everybody still at the school who teaches, with whether their badge is checked
 *                and in date, the gearbox they teach, the miles from the learner's postcode (or
 *                home pickup) to their base, how far they travel, and over the next 14 days the
 *                minutes open for lessons (working hours and extra hours, less time off) and the
 *                minutes of that not taken by lessons, their buffers included.
 */
create or replace function private.learner_allocation_facts(p_business_id uuid, p_learner_id uuid, p_now timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with learner as (
    select lp.transmission,
           coalesce(lp.location, pick.location) as location,
           coalesce(pc.outcode, nullif(split_part(coalesce(lp.postcode, pick.postcode, ''), ' ', 1), '')) as outcode
      from public.learner_profiles lp
      left join lateral (
        select p.location, p.postcode
          from public.pickup_points p
         where p.learner_id = lp.user_id and p.is_default
         limit 1
      ) as pick on true
      left join public.postcodes pc on pc.postcode = coalesce(lp.postcode, pick.postcode)
     where lp.user_id = p_learner_id
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
  team as (
    select p.id, p.display_name, p.transmission, p.base_location, p.radius_miles, p.verification_status, p.badge_expiry
      from public.instructor_profiles p
      join public.memberships m on m.business_id = p.business_id and m.user_id = p.user_id and m.status = 'active'
     where p.business_id = p_business_id
  ),
  times as (
    select t.id,
           ((
              coalesce((
                select range_agg(open_range.period)
                  from (
                    select tstzrange((d.day + wh.start_time) at time zone 'Europe/London',
                                     (d.day + wh.end_time) at time zone 'Europe/London', '[)') as period
                      from days d
                      join public.working_hours wh on wh.instructor_id = t.id and wh.weekday = extract(isodow from d.day)
                    union all
                    select e.period
                      from public.availability_exceptions e
                     where e.instructor_id = t.id and e.kind = 'open' and e.period && w.period
                  ) as open_range
              ), '{}'::tstzmultirange)
              - coalesce((
                  select range_agg(e.period)
                    from public.availability_exceptions e
                   where e.instructor_id = t.id and e.kind = 'blocked' and e.period && w.period
                ), '{}'::tstzmultirange)
            ) * tstzmultirange(w.period)) as open_time,
           coalesce((
             select range_agg(b.blocked_range)
               from public.bookings b
              where b.instructor_id = t.id
                and b.status in ('pending_payment', 'requested', 'confirmed', 'in_progress')
                and (b.status <> 'requested' or b.expires_at > p_now)
                and b.blocked_range && w.period
           ), '{}'::tstzmultirange) as taken_time
      from team t
      cross join window_range w
  )
  select jsonb_build_object(
    'learner', (select jsonb_build_object('transmission', l.transmission, 'outcode', l.outcode) from learner l),
    'instructors', coalesce((
      select jsonb_agg(jsonb_build_object(
               'instructor_id', t.id,
               'name', t.display_name,
               'badge', case
                          when t.verification_status <> 'approved' then 'unchecked'
                          when t.badge_expiry is not null and t.badge_expiry < (p_now at time zone 'Europe/London')::date then 'expired'
                          else 'checked'
                        end,
               'transmission', t.transmission,
               'distance_miles', (
                 select round((extensions.st_distance(l.location, t.base_location) / 1609.344)::numeric, 2)
                   from learner l
                  where l.location is not null and t.base_location is not null
               ),
               'radius_miles', t.radius_miles,
               'open_minutes', (select coalesce(sum(extract(epoch from upper(r) - lower(r))), 0) / 60 from unnest(x.open_time) as r)::integer,
               'free_minutes', (select coalesce(sum(extract(epoch from upper(r) - lower(r))), 0) / 60 from unnest(x.open_time - x.taken_time) as r)::integer
             ) order by t.display_name, t.id)
        from team t
        join times x on x.id = t.id
    ), '[]'::jsonb)
  );
$$;

revoke all on function private.learner_allocation_facts(uuid, uuid, timestamptz) from public, anon, authenticated;

/** The facts, now, for somebody who runs the school and a learner the school has (SCH-03). */
create or replace function public.learner_allocation(p_business_id uuid, p_learner_id uuid)
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
  if not exists (select 1 from public.businesses b where b.id = p_business_id and b.type = 'school') then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if not private.auth_has_permission(p_business_id, 'manage_members') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if not exists (select 1 from public.learner_relationships r where r.business_id = p_business_id and r.learner_id = p_learner_id) then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  return private.learner_allocation_facts(p_business_id, p_learner_id, now());
end;
$$;

revoke all on function public.learner_allocation(uuid, uuid) from public, anon;
grant execute on function public.learner_allocation(uuid, uuid) to authenticated;
