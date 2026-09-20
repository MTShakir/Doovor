-- An instructor's week and month at a glance (MNY-01, DIA-04, D-177).
--
-- The product owner asked for stats on Today: what was earned, drawn day by day, with the hours
-- booked and how many learners were taught. It is about the instructor's own lessons, whichever
-- Business they teach for, so it works from who is asking rather than from a Business.
--
--   days:     every day in the range, so an empty day is a gap in the picture rather than missing.
--             A lesson counts on the day it is taught, and by how it was paid for, which is why
--             credit is there: no money arrives, but the lesson was paid for.
--   minutes:  the length of every lesson that is on, whether or not it has been paid for.
--   learners: the people taught in those days, counted once each.

create or replace function public.instructor_dashboard(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_profiles uuid[];
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from >= p_to or p_to - p_from > interval '400 days' then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "range"}';
  end if;

  select array_agg(i.id) into v_profiles
    from public.instructor_profiles i
   where i.user_id = v_user;
  if v_profiles is null then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  return (
    with span as (
      select p_from as from_at, p_to as to_at
    ),
    lessons as (
      select (k.starts_at at time zone 'Europe/London')::date as day,
             k.learner_id,
             k.payment_status,
             k.price_pence,
             (extract(epoch from (k.ends_at - k.starts_at)) / 60)::integer as minutes
        from public.bookings k
        cross join span s
       where k.instructor_id = any (v_profiles)
         and k.starts_at >= s.from_at and k.starts_at < s.to_at
         and k.status in ('confirmed', 'in_progress', 'completed', 'no_show')
    ),
    every_day as (
      select d::date as day
        from generate_series(
               (p_from at time zone 'Europe/London')::date,
               ((p_to at time zone 'Europe/London') - interval '1 second')::date,
               interval '1 day'
             ) as d
    ),
    earned as (
      select l.day,
             coalesce(sum(l.price_pence) filter (where l.payment_status = 'paid_card'), 0)::bigint as card_pence,
             coalesce(sum(l.price_pence) filter (where l.payment_status = 'paid_cash'), 0)::bigint as cash_pence,
             coalesce(sum(l.price_pence) filter (where l.payment_status = 'paid_bank'), 0)::bigint as bank_pence,
             coalesce(sum(l.price_pence) filter (where l.payment_status = 'paid_credit'), 0)::bigint as credit_pence
        from lessons l
       group by l.day
    )
    select jsonb_build_object(
      'days', (
        select coalesce(
                 jsonb_agg(
                   jsonb_build_object(
                     'day', d.day,
                     'card_pence', coalesce(e.card_pence, 0),
                     'cash_pence', coalesce(e.cash_pence, 0),
                     'bank_pence', coalesce(e.bank_pence, 0),
                     'credit_pence', coalesce(e.credit_pence, 0)
                   )
                   order by d.day
                 ),
                 '[]'::jsonb
               )
          from every_day d
          left join earned e on e.day = d.day
      ),
      'earned_pence', (select coalesce(sum(e.card_pence + e.cash_pence + e.bank_pence + e.credit_pence), 0)::bigint from earned e),
      'minutes', (select coalesce(sum(l.minutes), 0)::integer from lessons l),
      'learners', (select count(distinct l.learner_id)::integer from lessons l)
    )
  );
end;
$$;

comment on function public.instructor_dashboard(timestamptz, timestamptz) is
  'What an instructor earned, taught and how many learners they saw over a range (MNY-01, D-177).';

revoke all on function public.instructor_dashboard(timestamptz, timestamptz) from public, anon;
grant execute on function public.instructor_dashboard(timestamptz, timestamptz) to authenticated;
