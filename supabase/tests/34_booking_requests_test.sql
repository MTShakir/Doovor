-- Answering a request, and the ones nobody answered (BOK-06, R-12, M2-18).
begin;
select plan(10);

select tests.create_fixture();

\set ian 'b1000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set ivy_user 'b0000000-0000-0000-0000-000000000004'
\set manager_user 'b0000000-0000-0000-0000-000000000002'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set lesson_type 'b2000000-0000-0000-0000-000000000001'

create or replace function pg_temp.request(p_starts text)
returns uuid language sql as $$
  insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                               buffer_minutes, status, price_pence, source, expires_at)
  values ('bbbb0000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000001',
          'c0000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
          p_starts::timestamptz, p_starts::timestamptz + interval '1 hour', 30, 'requested', 4200, 'self',
          now() + interval '6 hours')
  returning id;
$$;

select pg_temp.request('2026-09-15 10:00+01') as first \gset

select tests.authenticate_as(:'ian_user');
select is(
  (select public.decide_booking_request(:'first', true)),
  'confirmed',
  'the instructor accepts, and the lesson is on'
);
select is(
  (select expires_at from public.bookings where id = :'first'),
  null,
  'and it is no longer counting down'
);
select throws_ok(
  format($$ select public.decide_booking_request(%L, true) $$, :'first'),
  'P0001', 'VALIDATION_FAILED', 'answering it twice is refused'
);

-- Declining says why, and the slot goes back.
select tests.clear_authentication();
select pg_temp.request('2026-09-15 14:00+01') as second \gset
select tests.authenticate_as(:'manager_user');
select is(
  (select public.decide_booking_request(:'second', false, 'Away that afternoon')),
  'cancelled',
  'a manager may answer for the instructor'
);
select is(
  (select cancel_reason from public.bookings where id = :'second'),
  'Away that afternoon',
  'and the reason is kept with the booking'
);
select is(
  (select cancelled_by from public.bookings where id = :'second'),
  :'manager_user'::uuid,
  'along with who answered'
);

-- Nobody else.
select tests.clear_authentication();
select pg_temp.request('2026-09-15 16:00+01') as third \gset
select tests.authenticate_as(:'ivy_user');
select throws_ok(
  format($$ select public.decide_booking_request(%L, true) $$, :'third'),
  '42501', null, 'another instructor cannot answer somebody else request'
);

select tests.authenticate_as(:'lee');
select throws_ok(
  format($$ select public.decide_booking_request(%L, true) $$, :'third'),
  '42501', null, 'and neither can the learner who made it'
);

-- What nobody answered in time.
select tests.clear_authentication();
update public.bookings set expires_at = now() - interval '1 minute' where id = :'third';

select is(
  (select public.system_expire_requests()),
  1,
  'the sweep expires a request nobody answered'
);
select is(
  (select status::text from public.bookings where id = :'third'),
  'expired',
  'and the slot is free again'
);

select * from finish();
rollback;
