-- A fee is owed from when the lesson was called off (PAY-06, SCH-01, R-06, D-355).
--
-- A learner who called a lesson off late saw the fee owed straight away, but the school's Overview
-- and the Money screens counted what is owed only for lessons whose time had come, so the fee
-- for a lesson called off two days ahead was "Nothing owed" there until the day itself. Both now
-- count a fee from when the lesson was called off, and a lesson itself once it has started, as
-- before.

create or replace function public.money_summary(p_business_id uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_whole boolean;
  v_revenue boolean;
  v_mine uuid[];
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '400 days' then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "period"}';
  end if;

  v_whole := p_business_id in (select private.auth_business_ids(array['owner', 'manager']::public.membership_role[]))
             or private.auth_is_staff();
  if not v_whole then
    select coalesce(array_agg(i.id), array[]::uuid[])
      into v_mine
      from public.instructor_profiles i
     where i.business_id = p_business_id
       and i.id in (select private.auth_instructor_ids());
    if cardinality(v_mine) = 0 then
      raise exception 'NOT_ALLOWED' using errcode = '42501';
    end if;
  end if;
  -- An instructor sees what their own lessons took; the whole Business's takings need the permission.
  v_revenue := not v_whole or private.auth_has_permission(p_business_id, 'view_revenue') or private.auth_is_staff();

  return jsonb_build_object(
    'whole_business', v_whole,

    'paid', case when v_revenue then (
      select jsonb_build_object(
               'total_pence', coalesce(sum(p.amount_pence), 0)::integer,
               'card_pence', coalesce(sum(p.amount_pence) filter (where p.method = 'card'), 0)::integer,
               'cash_pence', coalesce(sum(p.amount_pence) filter (where p.method = 'cash'), 0)::integer,
               'bank_pence', coalesce(sum(p.amount_pence) filter (where p.method = 'bank'), 0)::integer,
               'count', count(*)::integer)
        from public.payments p
        left join public.bookings b on b.id = p.booking_id
       where p.business_id = p_business_id
         and p.status in ('paid', 'partially_refunded', 'refunded')
         and p.paid_at >= p_from and p.paid_at < p_to
         and not exists (select 1 from public.credit_lots l where l.payment_id = p.id)
         and (v_whole or b.instructor_id = any (v_mine))
    ) end,

    'credit_sold', case when v_whole and v_revenue then (
      select jsonb_build_object(
               'total_pence', coalesce(sum(p.amount_pence), 0)::integer,
               'minutes', coalesce(sum(l.minutes_total), 0)::integer,
               'count', count(*)::integer)
        from public.payments p
        join public.credit_lots l on l.payment_id = p.id
       where p.business_id = p_business_id
         and p.status in ('paid', 'partially_refunded', 'refunded')
         and p.paid_at >= p_from and p.paid_at < p_to
    ) end,

    'refunds', case when v_revenue then (
      select jsonb_build_object(
               'total_pence', coalesce(sum(r.amount_pence), 0)::integer,
               'count', count(*)::integer)
        from public.refunds r
        left join public.bookings b on b.id = r.booking_id
       where r.business_id = p_business_id
         and r.status = 'succeeded'
         and r.kind in ('card', 'offline')
         and r.settled_at >= p_from and r.settled_at < p_to
         and (v_whole or b.instructor_id = any (v_mine))
    ) end,

    'unpaid', (
      select jsonb_build_object(
               'total_pence', coalesce(sum(case when b.status in ('cancelled', 'no_show') then b.fee_pence else b.price_pence end), 0)::integer,
               'count', count(*)::integer)
        from public.bookings b
       where b.business_id = p_business_id
         and b.starts_at >= p_from and b.starts_at < p_to
         -- A lesson is owed for once it has started; a fee from when the lesson was called off,
         -- which may be days before it would have started (D-355).
         and (b.starts_at <= now() or b.status in ('cancelled', 'no_show'))
         and (
           (b.status in ('confirmed', 'in_progress', 'completed')
            and b.payment_status in ('unpaid', 'pending', 'failed')
            and b.price_pence > 0
            and b.payment_mode <> 'credit')
           or (b.status in ('cancelled', 'no_show')
               and coalesce(b.fee_pence, 0) > 0
               and b.payment_status in ('unpaid', 'failed'))
         )
         and (v_whole or b.instructor_id = any (v_mine))
    )
  );
end;
$$;

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
       -- A fee is owed from when the lesson was called off, not from when it would have started (D-355).
       and (b.starts_at <= p_now or b.status in ('cancelled', 'no_show'))
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
