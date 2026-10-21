-- A fee paid is named as the fee it is, in the history and on the Money screen (PAY-06, MNY-01, D-323).
begin;
select plan(4);

select tests.create_fixture();

\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set asha_biz 'aaaa0000-0000-0000-0000-000000000000'
\set lee 'c0000000-0000-0000-0000-000000000001'

create function pg_temp.lesson(p_days integer, p_status public.booking_status, p_fee integer)
returns uuid language sql as $$
  insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                               buffer_minutes, status, price_pence, source, fee_pence, cancelled_at)
  values ('aaaa0000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
          'a2000000-0000-0000-0000-000000000001', date_trunc('hour', now()) + make_interval(days => p_days, hours => 10),
          date_trunc('hour', now()) + make_interval(days => p_days, hours => 11), 30, p_status, 4200, 'instructor',
          p_fee, case when p_status = 'cancelled' then now() end)
  returning id;
$$;

create function pg_temp.paid(p_booking uuid, p_pence integer)
returns uuid language sql as $$
  insert into public.payments (business_id, learner_id, booking_id, provider, amount_pence, method, status, paid_at)
  values ('aaaa0000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001', p_booking, 'offline', p_pence, 'cash', 'paid', now())
  returning id;
$$;

select pg_temp.paid(pg_temp.lesson(-3, 'completed', null), 4200) as lesson_paid \gset
select pg_temp.paid(pg_temp.lesson(1, 'cancelled', 2100), 2100) as fee_paid \gset

select tests.authenticate_as(:'asha_user');
select is(
  (select p ->> 'fee_for' from jsonb_array_elements(public.learner_balance(:'asha_biz', :'lee') -> 'payments') p where p ->> 'id' = :'fee_paid'),
  'cancelled',
  'a late cancellation fee paid is that fee in the history'
);
select is(
  (select p ->> 'fee_for' from jsonb_array_elements(public.learner_balance(:'asha_biz', :'lee') -> 'payments') p where p ->> 'id' = :'lesson_paid'),
  null,
  'and a lesson paid for is the lesson'
);
select is(
  (select t ->> 'fee_for' from jsonb_array_elements(public.money_transactions(:'asha_biz', 10, 0) -> 'rows') t where t ->> 'id' = :'fee_paid'),
  'cancelled',
  'the Money screen says so too'
);
select is(
  (select t ->> 'fee_for' from jsonb_array_elements(public.money_transactions(:'asha_biz', 10, 0) -> 'rows') t where t ->> 'id' = :'lesson_paid'),
  null,
  'and of the lesson'
);
reset role;

select * from finish();
rollback;
