-- Calling a lesson off (BOK-09, R-06, R-08, M2-22).
begin;
select plan(11);

select tests.create_fixture();

\set ian 'b1000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set ivy_user 'b0000000-0000-0000-0000-000000000004'
\set manager_user 'b0000000-0000-0000-0000-000000000002'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set lesson_type 'b2000000-0000-0000-0000-000000000001'

-- The Business keeps the default policy: free up to 48 hours, then the full fee.
create or replace function pg_temp.lesson(p_in interval)
returns uuid language sql as $$
  insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                               buffer_minutes, status, price_pence, source)
  values ('bbbb0000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000001',
          'c0000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
          now() + p_in, now() + p_in + interval '1 hour', 30, 'confirmed', 4200, 'instructor')
  returning id;
$$;

-- ---------------------------------------------------------------------------------------
-- A learner, in time and late (R-06).
-- ---------------------------------------------------------------------------------------
select pg_temp.lesson(interval '5 days') as early \gset
select tests.authenticate_as(:'lee');

select is(
  (select public.cancel_booking(:'early') ->> 'late'),
  'false',
  'a learner cancelling five days out is in time'
);
select is(
  (select fee_pence from public.bookings where id = :'early'),
  0,
  'and is charged nothing'
);
select is(
  (select status::text from public.bookings where id = :'early'),
  'cancelled',
  'and the lesson is off'
);

select tests.clear_authentication();
select pg_temp.lesson(interval '2 hours') as soon \gset
select tests.authenticate_as(:'lee');

select is(
  (select public.cancel_booking(:'soon') ->> 'late'),
  'true',
  'two hours before is a late cancellation'
);
select is(
  (select fee_pence from public.bookings where id = :'soon'),
  4200,
  'and the default policy charges the whole lesson'
);
select is(
  (select late_cancellation from public.bookings where id = :'soon'),
  true,
  'which is recorded on the booking itself'
);

-- ---------------------------------------------------------------------------------------
-- The instructor, who has to say why and charges nothing (R-08).
-- ---------------------------------------------------------------------------------------
select tests.clear_authentication();
select pg_temp.lesson(interval '3 hours') as theirs \gset
select tests.authenticate_as(:'ian_user');

select throws_ok(
  format($$ select public.cancel_booking(%L) $$, :'theirs'),
  'P0001', 'VALIDATION_FAILED', 'an instructor cancelling has to say why'
);
select is(
  (select public.cancel_booking(:'theirs', 'Car in for repair') ->> 'fee_pence'),
  '0',
  'and the learner is charged nothing, however late it is'
);
select is(
  (select cancel_reason from public.bookings where id = :'theirs'),
  'Car in for repair',
  'the reason is kept with the booking'
);

-- ---------------------------------------------------------------------------------------
-- Nobody else, and not twice.
-- ---------------------------------------------------------------------------------------
select tests.clear_authentication();
select pg_temp.lesson(interval '4 days') as other \gset
select tests.authenticate_as(:'ivy_user');
select throws_ok(
  format($$ select public.cancel_booking(%L, 'Not mine') $$, :'other'),
  '42501', null, 'an instructor with nothing to do with the lesson cannot cancel it'
);

select tests.authenticate_as(:'manager_user');
select lives_ok(
  format($$ select public.cancel_booking(%L, 'School closed that day') $$, :'other'),
  'a manager of the Business can'
);

select * from finish();
rollback;
