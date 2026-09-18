-- How many lessons one account may book in an hour (NFR-SEC-03, M6-03, D-137).
begin;
select plan(6);

select tests.create_fixture();

\set asha 'a1000000-0000-0000-0000-000000000001'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set asha_type 'a2000000-0000-0000-0000-000000000001'
\set lee 'c0000000-0000-0000-0000-000000000001'

-- Asha teaches every day at an hour's lesson, so the times below are hers to book.
insert into public.lesson_prices (business_id, lesson_type_id, duration_minutes, price_pence)
values ('aaaa0000-0000-0000-0000-000000000000', :'asha_type', 60, 4200);
insert into public.lesson_prices (business_id, lesson_type_id, duration_minutes, price_pence)
values ('bbbb0000-0000-0000-0000-000000000000', 'b2000000-0000-0000-0000-000000000001', 60, 4200);
insert into public.working_hours (instructor_id, business_id, weekday, start_time, end_time)
select 'b1000000-0000-0000-0000-000000000001', 'bbbb0000-0000-0000-0000-000000000000', d, '06:00', '22:00' from generate_series(1, 7) as d;
insert into public.working_hours (instructor_id, business_id, weekday, start_time, end_time)
select :'asha', 'aaaa0000-0000-0000-0000-000000000000', d, '06:00', '22:00' from generate_series(1, 7) as d;

-- One free slot at a time, a week out, so nothing collides with the fixture's own lessons.
create function pg_temp.book(p_hour integer)
returns uuid language sql as $$
  select public.create_booking(
    'a1000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000001',
    'a2000000-0000-0000-0000-000000000001',
    ((private.today() + 7)::timestamp + make_interval(hours => p_hour)) at time zone 'Europe/London',
    60
  );
$$;

select tests.authenticate_as(:'asha_user');
select isnt(pg_temp.book(7), null, 'an instructor books a lesson');
select isnt(pg_temp.book(9), null, 'and another');

-- The allowance spent, as a busy afternoon of booking would.
select tests.clear_authentication();
select public.system_rate_limit_hit('book', :'asha_user', 3600, 120) from generate_series(1, 118);
select tests.authenticate_as(:'asha_user');
select throws_ok(
  $$ select pg_temp.book(11) $$,
  '53400', 'RATE_LIMITED', 'the hundred and twenty first is refused'
);
select is(
  (select count(*)::int from public.bookings b
    where b.learner_id = :'lee' and b.starts_at = ((private.today() + 7)::timestamp + time '11:00') at time zone 'Europe/London'),
  0,
  'and nothing is booked by a refused attempt'
);

-- Somebody else's allowance is their own.
select tests.authenticate_as('b0000000-0000-0000-0000-000000000003');
select lives_ok(
  $$ select public.create_booking('b1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
       'b2000000-0000-0000-0000-000000000001', ((private.today() + 8)::timestamp + time '13:00') at time zone 'Europe/London', 60) $$,
  'another instructor books as usual'
);

-- One weekly plan is one thing the person did, however many lessons it lays down.
select tests.clear_authentication();
select is(
  (select hits from public.rate_limit_buckets where key = 'book:' || 'b0000000-0000-0000-0000-000000000003'),
  1,
  'and a booking counts once'
);

select * from finish();
rollback;
