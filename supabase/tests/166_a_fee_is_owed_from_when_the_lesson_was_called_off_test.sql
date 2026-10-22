-- A fee is owed from when the lesson was called off (PAY-06, SCH-01, R-06, D-355).
begin;
select plan(4);

select tests.create_fixture();

\set ian 'b1000000-0000-0000-0000-000000000001'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set owner_user 'b0000000-0000-0000-0000-000000000001'
\set lesson_type 'b2000000-0000-0000-0000-000000000001'

-- Lee called off a lesson two days from now, too late, and owes its £42 as the fee.
insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at, buffer_minutes,
                             status, payment_status, price_pence, fee_pence, late_cancellation, cancelled_at, source)
values (:'school', :'ian', :'lee', :'lesson_type', date_trunc('hour', now()) + interval '2 days',
        date_trunc('hour', now()) + interval '2 days 1 hour', 30, 'cancelled', 'unpaid', 4200, 4200, true, now(), 'self');
-- And a lesson still to come, unpaid, which is owed for only once it has started.
insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at, buffer_minutes,
                             status, payment_status, price_pence, source)
values (:'school', :'ian', :'lee', :'lesson_type', date_trunc('hour', now()) + interval '3 days',
        date_trunc('hour', now()) + interval '3 days 1 hour', 30, 'confirmed', 'unpaid', 4200, 'self');

select is(
  (private.school_overview_facts(:'school', now()) -> 'unpaid' ->> 'total_pence')::int,
  4200,
  'the Overview counts the fee as owed from when the lesson was called off'
);
select is(
  (private.school_overview_facts(:'school', now()) -> 'unpaid' ->> 'count')::int,
  1,
  'and not the lesson still to come'
);

select tests.authenticate_as(:'owner_user');
select is(
  (public.money_summary(:'school', now() - interval '1 day', now() + interval '7 days') -> 'unpaid' ->> 'total_pence')::int,
  4200,
  'Money counts it as owed too, in the week the lesson would have been'
);
select is(
  (public.money_summary(:'school', now() - interval '1 day', now() + interval '7 days') -> 'unpaid' ->> 'count')::int,
  1,
  'and not the lesson still to come'
);
select tests.clear_authentication();

select * from finish();
rollback;
