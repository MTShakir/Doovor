-- After the lesson (BOK-10, R-09, M2-25).
begin;
select plan(11);

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

-- The wait was a quarter of an hour until the product owner made it half (R-09, D-228), so the
-- boundary is worth pinning from both sides: twenty minutes in used to be allowed. Each lesson is
-- cleared before the next, because they are all this hour and a lesson blocks half an hour either
-- side of itself (R-01).
select tests.clear_authentication();
delete from public.bookings where id = :'waiting';
select pg_temp.lesson(interval '20 minutes') as twenty \gset
select tests.authenticate_as(:'ian_user');
select throws_ok(
  format($$ select public.mark_no_show(%L) $$, :'twenty'),
  'P0001', 'TOO_CLOSE', 'twenty minutes in is too early now the wait is half an hour'
);

select tests.clear_authentication();
delete from public.bookings where id = :'twenty';
select pg_temp.lesson(interval '31 minutes') as waited \gset
select tests.authenticate_as(:'ian_user');
select lives_ok(
  format($$ select public.mark_no_show(%L, 'Waited half an hour') $$, :'waited'),
  'half an hour in, an instructor can say nobody came'
);
select tests.clear_authentication();
delete from public.bookings where id = :'waited';

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
