-- After the lesson (BOK-10, R-09, M2-25).
begin;
select plan(9);

select tests.create_fixture();

\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set ivy_user 'b0000000-0000-0000-0000-000000000004'
\set lee 'c0000000-0000-0000-0000-000000000001'

create or replace function pg_temp.lesson(p_started interval)
returns uuid language sql as $$
  insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                               buffer_minutes, status, price_pence, source)
  values ('bbbb0000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000001',
          'c0000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
          now() - p_started, now() - p_started + interval '1 hour', 30, 'confirmed', 4200, 'instructor')
  returning id;
$$;

-- ---------------------------------------------------------------------------------------
-- Taught.
-- ---------------------------------------------------------------------------------------
-- Hours apart, because two lessons within ninety minutes of each other cannot both exist.
select pg_temp.lesson(interval '26 hours') as taught \gset
select tests.authenticate_as(:'ian_user');

select is(
  (select public.complete_booking(:'taught')),
  :'taught'::uuid,
  'the instructor marks a lesson that has happened as done'
);
select is(
  (select status::text from public.bookings where id = :'taught'),
  'completed',
  'and it is recorded as taught'
);
select throws_ok(
  format($$ select public.complete_booking(%L) $$, :'taught'),
  'P0001', 'VALIDATION_FAILED', 'and cannot be marked done twice'
);

select tests.clear_authentication();
select pg_temp.lesson(interval '-5 hours') as later \gset
select tests.authenticate_as(:'ian_user');
select throws_ok(
  format($$ select public.complete_booking(%L) $$, :'later'),
  'P0001', 'TOO_CLOSE', 'a lesson that has not started cannot have been taught'
);

-- ---------------------------------------------------------------------------------------
-- Nobody there (R-09).
-- ---------------------------------------------------------------------------------------
select tests.clear_authentication();
select pg_temp.lesson(interval '10 minutes') as waiting \gset
select tests.authenticate_as(:'ian_user');

select throws_ok(
  format($$ select public.mark_no_show(%L) $$, :'waiting'),
  'P0001', 'TOO_CLOSE', 'ten minutes in is too early to call it a no-show'
);

select tests.clear_authentication();
select pg_temp.lesson(interval '50 hours') as absent \gset
select tests.authenticate_as(:'ian_user');

select is(
  (select public.mark_no_show(:'absent', 'Waited twenty minutes') ->> 'fee_pence'),
  '4200',
  'a lesson nobody came to costs what a late cancellation costs'
);
select is(
  (select status::text from public.bookings where id = :'absent'),
  'no_show',
  'the lesson says what happened'
);
select is(
  (select late_cancellation from public.bookings where id = :'absent'),
  true,
  'and it counts as a late cancellation'
);

-- ---------------------------------------------------------------------------------------
-- Nobody else.
-- ---------------------------------------------------------------------------------------
select tests.clear_authentication();
select pg_temp.lesson(interval '74 hours') as other \gset
select tests.authenticate_as(:'ivy_user');
select throws_ok(
  format($$ select public.mark_no_show(%L) $$, :'other'),
  '42501', null, 'an instructor whose lesson it is not cannot mark it'
);

select * from finish();
rollback;
