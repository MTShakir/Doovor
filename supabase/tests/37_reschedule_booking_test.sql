-- Moving a lesson (BOK-08, M2-23).
begin;
select plan(9);

select tests.create_fixture();

\set ian 'b1000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set ivy_user 'b0000000-0000-0000-0000-000000000004'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set lou 'c0000000-0000-0000-0000-000000000002'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set lesson_type 'b2000000-0000-0000-0000-000000000001'

-- Ian works every weekday, eight until eight, so the times below are all inside his hours.
insert into public.working_hours (instructor_id, business_id, weekday, start_time, end_time)
select :'ian', :'school', weekday, '08:00', '20:00' from generate_series(1, 7) as weekday;
insert into public.lesson_prices (business_id, lesson_type_id, duration_minutes, price_pence)
values (:'school', :'lesson_type', 60, 4200);

-- Local times, on days in the future: a lesson at one in the morning is outside anybody's
-- hours, and the hour the test happens to run at is nobody's business.
create or replace function pg_temp.at_local(p_days integer, p_time text)
returns timestamptz language sql stable as $$
  select (((now() at time zone 'Europe/London')::date + p_days) + p_time::time) at time zone 'Europe/London';
$$;

create or replace function pg_temp.lesson(p_learner uuid, p_days integer, p_time text)
returns uuid language sql as $$
  insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                               buffer_minutes, status, price_pence, source)
  values ('bbbb0000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000001',
          p_learner, 'b2000000-0000-0000-0000-000000000001',
          pg_temp.at_local(p_days, p_time), pg_temp.at_local(p_days, p_time) + interval '1 hour',
          30, 'confirmed', 4200, 'instructor')
  returning id;
$$;

-- ---------------------------------------------------------------------------------------
-- The instructor moves one.
-- ---------------------------------------------------------------------------------------
select pg_temp.lesson(:'lee', 5, '10:00') as lesson \gset
select pg_temp.at_local(6, '10:00') as moved \gset

select tests.authenticate_as(:'ian_user');
select lives_ok(
  format($$ select public.reschedule_booking(%L, %L::timestamptz) $$, :'lesson', :'moved'),
  'the instructor moves a lesson to another day'
);
select is(
  (select starts_at from public.bookings where id = :'lesson'),
  :'moved'::timestamptz,
  'and the lesson is at the new time'
);
select is(
  (select extract(epoch from (ends_at - starts_at))::int from public.bookings where id = :'lesson'),
  3600,
  'still an hour long, because nobody asked to change that'
);

-- Moving it to where it already is is not a clash with itself.
select lives_ok(
  format($$ select public.reschedule_booking(%L, %L::timestamptz) $$, :'lesson', :'moved'),
  'a lesson is not in its own way'
);

-- ---------------------------------------------------------------------------------------
-- Somewhere already taken.
-- ---------------------------------------------------------------------------------------
select tests.clear_authentication();
select pg_temp.lesson(:'lou', 9, '14:00') as theirs \gset
select pg_temp.at_local(9, '14:00') as taken \gset

select tests.authenticate_as(:'ian_user');
select throws_ok(
  format($$ select public.reschedule_booking(%L, %L::timestamptz) $$, :'lesson', :'taken'),
  '23P01', 'SLOT_TAKEN', 'and cannot be moved on top of another one'
);

-- ---------------------------------------------------------------------------------------
-- The learner, before and after the window closes (R-06).
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'lee');
select pg_temp.at_local(7, '12:00') as later \gset
select lives_ok(
  format($$ select public.reschedule_booking(%L, %L::timestamptz) $$, :'lesson', :'later'),
  'a learner may move their own lesson while there is time'
);

select tests.clear_authentication();
select pg_temp.lesson(:'lee', 0, '23:00') as soon \gset
select pg_temp.at_local(8, '16:00') as elsewhere \gset

select tests.authenticate_as(:'lee');
select throws_ok(
  format($$ select public.reschedule_booking(%L, %L::timestamptz) $$, :'soon', :'elsewhere'),
  'P0001', 'TOO_CLOSE', 'and not once the free cancellation window has closed'
);

-- ---------------------------------------------------------------------------------------
-- Nobody else.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ivy_user');
select throws_ok(
  format($$ select public.reschedule_booking(%L, %L::timestamptz) $$, :'lesson', :'elsewhere'),
  '42501', null, 'an instructor with nothing to do with the lesson cannot move it'
);

select tests.authenticate_as(:'lou');
select throws_ok(
  format($$ select public.reschedule_booking(%L, %L::timestamptz) $$, :'lesson', :'elsewhere'),
  '42501', null, 'and neither can another learner'
);

select * from finish();
rollback;
