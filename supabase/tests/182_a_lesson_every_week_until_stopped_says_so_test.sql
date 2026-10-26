-- A lesson booked every week until it is stopped says so (NTF-03, BOK-05, D-394).
begin;
select plan(4);

select tests.create_fixture();

\set asha 'aaaa0000-0000-0000-0000-000000000000'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set asha_profile 'a1000000-0000-0000-0000-000000000001'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set standard 'a2000000-0000-0000-0000-000000000001'

insert into public.working_hours (instructor_id, business_id, weekday, start_time, end_time)
select :'asha_profile', :'asha', day, '08:00', '20:00' from generate_series(1, 7) as day;
insert into public.lesson_prices (business_id, lesson_type_id, duration_minutes, price_pence)
values (:'asha', :'standard', 60, 4200);

-- Thursday next week, whatever day this runs, as the weekly lessons test does (D-070).
create temp table thursday as
select (date_trunc('week', (now() at time zone 'Europe/London')::date + 7)::date + 3) as day;
grant select on thursday to authenticated;

select tests.authenticate_as(:'asha_user');
-- Three weeks until Asha stops it, and two weeks and no more.
create temp table open_ended as
select * from public.book_weekly(
  :'asha_profile', :'lee', :'standard', ((select day from thursday) + time '11:00') at time zone 'Europe/London', 60, 3, true
);
create temp table fixed as
select * from public.book_weekly(
  :'asha_profile', :'lee', :'standard', ((select day from thursday) + time '15:00') at time zone 'Europe/London', 60, 2, false
);
select tests.clear_authentication();

create temp table firsts as
select b.id, b.recurrence_id, to_char(b.starts_at at time zone 'Europe/London', 'HH24:MI') as at
  from public.bookings b
 where b.recurrence_id in (select recurrence_id from public.bookings where id in (select booking_id from open_ended union all select booking_id from fixed))
   and b.starts_at = (select min(x.starts_at) from public.bookings x where x.recurrence_id = b.recurrence_id);

select is(
  (select public.system_booking_notice(id) -> 'series' -> 'open_ended' from firsts where at = '11:00'),
  'true'::jsonb,
  'the first of lessons booked until somebody stops them says more follow'
);
select is(
  (select (public.system_booking_notice(id) -> 'series' ->> 'count')::int from firsts where at = '11:00'),
  3,
  'with how many are in the diary so far'
);
select is(
  (select public.system_booking_notice(id) -> 'series' -> 'open_ended' from firsts where at = '15:00'),
  'false'::jsonb,
  'and lessons booked for a number of weeks say they end'
);
select is(
  (select public.system_booking_notice(id) -> 'series' -> 'open_ended' from public.bookings b
    where b.recurrence_id = (select recurrence_id from firsts where at = '11:00')
      and b.id <> (select id from firsts where at = '11:00')
    limit 1),
  'true'::jsonb,
  'which the rest of them carry too, though only the first is told about'
);

select * from finish();
rollback;
