-- Lessons booked every week in one go are told about once, by the first of them (NTF-03, BOK-05, D-349).
begin;
select plan(6);

select tests.create_fixture();

\set ian 'b1000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set lesson_type 'b2000000-0000-0000-0000-000000000001'

insert into public.working_hours (instructor_id, business_id, weekday, start_time, end_time)
values (:'ian', :'school', 4, '08:00', '20:00');
insert into public.lesson_prices (business_id, lesson_type_id, duration_minutes, price_pence)
values (:'school', :'lesson_type', 60, 4200);

select tests.authenticate_as(:'ian_user');
create temp table weekly as
select * from public.book_weekly(
  :'ian', :'lee', :'lesson_type', (date '2026-03-26' + time '09:00') at time zone 'Europe/London', 60, 4
);
select public.create_booking(:'ian', :'lee', :'lesson_type', (date '2026-03-26' + time '15:00') at time zone 'Europe/London', 60) as single \gset
select tests.clear_authentication();

select is(
  (select (public.system_booking_notice(booking_id) -> 'series' ->> 'count')::int from weekly order by starts_at limit 1),
  4,
  'the first of four booked every week in one go knows there are four'
);
select is(
  (select (public.system_booking_notice(booking_id) -> 'series' ->> 'first')::boolean from weekly order by starts_at limit 1),
  true,
  'and that it is the first, which tells about all of them'
);
select is(
  (select public.system_booking_notice(booking_id) -> 'series' ->> 'last_starts_at' from weekly order by starts_at limit 1),
  to_jsonb((date '2026-04-16' + time '09:00') at time zone 'Europe/London') #>> '{}',
  'and when the last of them is, across the clocks going forward'
);
select is(
  (select count(*)::int from weekly where (public.system_booking_notice(booking_id) -> 'series' ->> 'first')::boolean = false),
  3,
  'the other three know they are not the first, and say nothing'
);
select is(
  (public.system_booking_notice(:'single') -> 'series' ->> 'count')::int,
  0,
  'a lesson booked on its own is told about on its own'
);

-- A week a plan books later, on its own, is told about on its own too.
update public.bookings set created_at = created_at + interval '7 days'
 where id = (select booking_id from weekly order by starts_at desc limit 1);
select is(
  (select (public.system_booking_notice(booking_id) -> 'series' ->> 'count')::int from weekly order by starts_at desc limit 1),
  0,
  'a lesson a plan adds later was not written with the rest, and is news of its own'
);

select * from finish();
rollback;
