-- Suggesting who teaches a learner says a trainee nobody supervises cannot be booked yet
-- (SCH-03, INS-04, R-18, D-356).
--
-- The suggestions put a trainee whose badge was checked among the instructors ready to teach, with
-- nothing to say they could not be booked, so a school could give a learner or a new pupil to
-- somebody nobody could book. A trainee nobody supervises is now marked so, and comes after those
-- who can be booked, as a badge not yet checked does.

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
                          -- A trainee nobody supervises cannot be booked yet (R-18, D-356).
                          when not private.is_supervised(t.id) then 'unsupervised'
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

create or replace function private.enquiry_allocation_facts(p_business_id uuid, p_enquiry_id uuid, p_now timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with learner as (
    -- The enquiry stands in for the learner: their gearbox, and where their postcode is.
    select e.transmission,
           pc.location,
           coalesce(pc.outcode, nullif(split_part(e.postcode, ' ', 1), '')) as outcode
      from public.school_enquiries e
      left join public.postcodes pc on pc.postcode = e.postcode
     where e.id = p_enquiry_id
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
                          -- A trainee nobody supervises cannot be booked yet (R-18, D-356).
                          when not private.is_supervised(t.id) then 'unsupervised'
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
