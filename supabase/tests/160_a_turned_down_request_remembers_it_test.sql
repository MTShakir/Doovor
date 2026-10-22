-- A request turned down remembers it, while its status stays cancelled for every rule about
-- lessons that are off (BOK-06, R-12, D-340).
begin;
select plan(5);

select tests.create_fixture();

\set ian_user 'b0000000-0000-0000-0000-000000000003'

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

select pg_temp.request('2026-09-16 10:00+01') as taken \gset
select pg_temp.request('2026-09-16 14:00+01') as turned_down \gset

select tests.authenticate_as(:'ian_user');
select public.decide_booking_request(:'taken', true);
select public.decide_booking_request(:'turned_down', false, 'Away that afternoon');
select tests.clear_authentication();

select is(
  (select declined_at from public.bookings where id = :'taken'),
  null,
  'a request accepted was never turned down'
);
select isnt(
  (select declined_at from public.bookings where id = :'turned_down'),
  null,
  'a request turned down says when'
);
select is(
  (select status::text from public.bookings where id = :'turned_down'),
  'cancelled',
  'and is still off as a cancellation is, for the fees, refunds and holds that read it so'
);

-- A lesson called off after it was booked is cancelled, and was never turned down.
select tests.authenticate_as(:'ian_user');
select public.cancel_booking(:'taken', 'The car is in for a service');
select tests.clear_authentication();
select is(
  (select status::text from public.bookings where id = :'taken'),
  'cancelled',
  'the accepted lesson, called off, is cancelled'
);
select is(
  (select declined_at from public.bookings where id = :'taken'),
  null,
  'and nothing says it was turned down'
);

select * from finish();
rollback;
