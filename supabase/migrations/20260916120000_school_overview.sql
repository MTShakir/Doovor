-- The school overview (SCH-01, M5-12).
--
-- The first thing a school's owner sees: lessons today and this week, money taken this month,
-- everything owed, how full each instructor's week is, and learners new this month. The figures
-- are worked out for a given moment in one function, so tests can hold the clock still; the one
-- the app calls checks who is asking and uses now (D-119).

/**
 * The figures for one school at one moment. Days, weeks (Monday to Sunday) and months are
 * London's, as on the Money screen (D-096).
 *
 *   lessons: lessons on, under way, done or missed, starting today and this week.
 *   revenue_month: money taken this month for lessons and fees, and for packages, less money
 *                  given back (D-096's paid, credit sold and refunds).
 *   unpaid: everything owed now: lessons that have started and are not paid, and fees owed
 *           (D-096's unpaid, over all time rather than a period).
 *   utilisation: for each instructor at the school, the minutes open for lessons this week (working
 *                hours and extra hours, less time off) and the minutes of those lessons this week.
 *   new_learners_month: learners the school took on this month.
 */
create or replace function private.school_overview_facts(p_business_id uuid, p_now timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with local_now as (
    select p_now at time zone 'Europe/London' as moment
  ),
  bounds as (
    select date_trunc('day', n.moment) at time zone 'Europe/London' as day_from,
           (date_trunc('day', n.moment) + interval '1 day') at time zone 'Europe/London' as day_to,
           date_trunc('week', n.moment) at time zone 'Europe/London' as week_from,
           (date_trunc('week', n.moment) + interval '7 days') at time zone 'Europe/London' as week_to,
           date_trunc('week', n.moment)::date as week_first_day,
           date_trunc('month', n.moment) at time zone 'Europe/London' as month_from,
           (date_trunc('month', n.moment) + interval '1 month') at time zone 'Europe/London' as month_to
      from local_now n
  ),
  lessons as (
    select count(*) filter (where b.starts_at >= x.day_from and b.starts_at < x.day_to)::integer as today,
           count(*)::integer as this_week
      from public.bookings b
      cross join bounds x
     where b.business_id = p_business_id
       and b.status in ('confirmed', 'in_progress', 'completed', 'no_show')
       and b.starts_at >= x.week_from and b.starts_at < x.week_to
  ),
  payments_month as (
    select p.amount_pence,
           exists (select 1 from public.credit_lots l where l.payment_id = p.id) as for_package
      from public.payments p
      cross join bounds x
     where p.business_id = p_business_id
       and p.status in ('paid', 'partially_refunded', 'refunded')
       and p.paid_at >= x.month_from and p.paid_at < x.month_to
  ),
  money_in as (
    select coalesce(sum(amount_pence) filter (where not for_package), 0)::integer as lessons_pence,
           coalesce(sum(amount_pence) filter (where for_package), 0)::integer as packages_pence
      from payments_month
  ),
  money_back as (
    select coalesce(sum(r.amount_pence), 0)::integer as refunds_pence
      from public.refunds r
      cross join bounds x
     where r.business_id = p_business_id
       and r.status = 'succeeded'
       and r.kind in ('card', 'offline')
       and r.settled_at >= x.month_from and r.settled_at < x.month_to
  ),
  owed as (
    select coalesce(sum(case when b.status in ('cancelled', 'no_show') then b.fee_pence else b.price_pence end), 0)::integer as total_pence,
           count(*)::integer as count
      from public.bookings b
     where b.business_id = p_business_id
       and b.starts_at <= p_now
       and (
         (b.status in ('confirmed', 'in_progress', 'completed')
          and b.payment_status in ('unpaid', 'pending', 'failed')
          and b.price_pence > 0
          and b.payment_mode <> 'credit')
         or (b.status in ('cancelled', 'no_show')
             and coalesce(b.fee_pence, 0) > 0
             and b.payment_status in ('unpaid', 'failed'))
       )
  ),
  team as (
    select p.id, p.display_name
      from public.instructor_profiles p
      join public.memberships m on m.business_id = p.business_id and m.user_id = p.user_id and m.status = 'active'
     where p.business_id = p_business_id
  ),
  week_days as (
    select x.week_first_day + offset_days as day
      from bounds x
      cross join generate_series(0, 6) as offset_days
  ),
  weeks as (
    select t.id,
           t.display_name,
           -- Open: the working hours on each day of the week and any extra hours, less time off.
           ((
              coalesce((
                select range_agg(open_range.period)
                  from (
                    select tstzrange((d.day + w.start_time) at time zone 'Europe/London',
                                     (d.day + w.end_time) at time zone 'Europe/London', '[)') as period
                      from week_days d
                      join public.working_hours w on w.instructor_id = t.id and w.weekday = extract(isodow from d.day)
                    union all
                    select e.period
                      from public.availability_exceptions e
                     where e.instructor_id = t.id
                       and e.kind = 'open'
                       and e.period && tstzrange(x.week_from, x.week_to, '[)')
                  ) as open_range
              ), '{}'::tstzmultirange)
              - coalesce((
                  select range_agg(e.period)
                    from public.availability_exceptions e
                   where e.instructor_id = t.id
                     and e.kind = 'blocked'
                     and e.period && tstzrange(x.week_from, x.week_to, '[)')
                ), '{}'::tstzmultirange)
            ) * tstzmultirange(tstzrange(x.week_from, x.week_to, '[)'))) as open_time,
           -- Booked: the lessons themselves, whether or not they sit in open time.
           (coalesce((
              select range_agg(tstzrange(b.starts_at, b.ends_at, '[)'))
                from public.bookings b
               where b.instructor_id = t.id
                 and b.status in ('confirmed', 'in_progress', 'completed', 'no_show')
                 and b.starts_at < x.week_to and b.ends_at > x.week_from
            ), '{}'::tstzmultirange) * tstzmultirange(tstzrange(x.week_from, x.week_to, '[)'))) as booked_time
      from team t
      cross join bounds x
  ),
  utilisation as (
    select w.id,
           w.display_name,
           (select coalesce(sum(extract(epoch from upper(r) - lower(r))), 0) / 60 from unnest(w.open_time) as r)::integer as open_minutes,
           (select coalesce(sum(extract(epoch from upper(r) - lower(r))), 0) / 60 from unnest(w.booked_time) as r)::integer as booked_minutes
      from weeks w
  ),
  learners as (
    select count(distinct r.learner_id)::integer as new_this_month
      from public.learner_relationships r
      cross join bounds x
     where r.business_id = p_business_id
       and r.created_at >= x.month_from and r.created_at < x.month_to
  )
  select jsonb_build_object(
    'lessons', (select jsonb_build_object('today', l.today, 'this_week', l.this_week) from lessons l),
    'revenue_month', (
      select jsonb_build_object(
               'lessons_pence', i.lessons_pence,
               'packages_pence', i.packages_pence,
               'refunds_pence', o.refunds_pence,
               'total_pence', i.lessons_pence + i.packages_pence - o.refunds_pence)
        from money_in i
        cross join money_back o
    ),
    'unpaid', (select jsonb_build_object('total_pence', d.total_pence, 'count', d.count) from owed d),
    'utilisation', (
      select jsonb_build_object(
               'open_minutes', coalesce(sum(u.open_minutes), 0)::integer,
               'booked_minutes', coalesce(sum(u.booked_minutes), 0)::integer,
               'instructors', coalesce(
                 jsonb_agg(jsonb_build_object(
                   'instructor_id', u.id,
                   'name', u.display_name,
                   'open_minutes', u.open_minutes,
                   'booked_minutes', u.booked_minutes
                 ) order by u.display_name, u.id),
                 '[]'::jsonb))
        from utilisation u
    ),
    'new_learners_month', (select l.new_this_month from learners l)
  );
$$;

revoke all on function private.school_overview_facts(uuid, timestamptz) from public, anon, authenticated;

/**
 * The overview for the people who run a school (SCH-01): its owner and managers, and platform
 * staff. Money taken is for those allowed to see revenue: the owner, staff, and a manager the owner
 * allows (PRD 6.2); anybody else gets the rest with revenue_month null.
 */
create or replace function public.school_overview(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_facts jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not exists (select 1 from public.businesses b where b.id = p_business_id and b.type = 'school') then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if not (
    p_business_id in (select private.auth_business_ids(array['owner', 'manager']::public.membership_role[]))
    or private.auth_is_staff()
  ) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  v_facts := private.school_overview_facts(p_business_id, now());
  if not (private.auth_has_permission(p_business_id, 'view_revenue') or private.auth_is_staff()) then
    v_facts := jsonb_set(v_facts, '{revenue_month}', 'null'::jsonb);
  end if;
  return v_facts;
end;
$$;

revoke all on function public.school_overview(uuid) from public, anon;
grant execute on function public.school_overview(uuid) to authenticated;
