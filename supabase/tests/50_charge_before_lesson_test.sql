-- Charging a card the day before a lesson (PAY-03, M3-09).
begin;
select plan(12);

select tests.create_fixture();

\set ben 'b0000000-0000-0000-0000-000000000001'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set lou 'c0000000-0000-0000-0000-000000000002'
\set liz 'c0000000-0000-0000-0000-000000000003'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set lesson_type 'b2000000-0000-0000-0000-000000000001'

select tests.authenticate_as(:'ben');
select public.set_payments_account(:'school', 'acct_charge');
select tests.clear_authentication();
select public.system_set_payments_state('acct_charge', true, true, true);

-- Lee has a card kept with the school; Lou never saved one.
select tests.authenticate_as(:'lee');
select public.set_billing_customer(:'school', 'cus_lee');
select tests.clear_authentication();

create or replace function pg_temp.lesson(p_learner uuid, p_in interval, p_mode public.booking_payment_mode,
                                          p_payment public.booking_payment_status default 'unpaid')
returns uuid language sql as $$
  insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                               buffer_minutes, status, payment_mode, payment_status, price_pence, source)
  values ('bbbb0000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000001', p_learner,
          'b2000000-0000-0000-0000-000000000001', now() + p_in, now() + p_in + interval '1 hour', 30, 'confirmed',
          p_mode, p_payment, 4200, 'instructor')
  returning id;
$$;

create or replace function pg_temp.due(p_booking uuid, p_hours integer default 24) returns jsonb language sql as $$
  select one from jsonb_array_elements(public.system_lessons_to_charge(p_hours)) as one
   where (one ->> 'booking_id')::uuid = p_booking;
$$;

select pg_temp.lesson(:'lee', interval '20 hours', 'before_lesson') as tomorrow \gset
select pg_temp.lesson(:'lou', interval '22 hours', 'before_lesson') as no_card \gset
select pg_temp.lesson(:'lee', interval '30 hours', 'before_lesson') as later \gset
select pg_temp.lesson(:'liz', interval '23 hours 45 minutes', 'before_lesson', 'paid_card') as paid \gset
select pg_temp.lesson(:'liz', interval '26 hours', 'at_booking') as other_terms \gset

-- ---------------------------------------------------------------------------------------
-- Which lessons are due.
-- ---------------------------------------------------------------------------------------
select is(
  (select pg_temp.due(:'tomorrow') ->> 'customer_id') || ' ' || (select pg_temp.due(:'tomorrow') ->> 'account_id')
    || ' ' || (select pg_temp.due(:'tomorrow') ->> 'amount_pence'),
  'cus_lee acct_charge 4200',
  'a lesson starting within a day is due, with the card holder, the account and the price'
);

select is(
  (select pg_temp.due(:'no_card') ? 'customer_id' and pg_temp.due(:'no_card') -> 'customer_id' = 'null'::jsonb),
  true,
  'a learner who never saved a card is still due, with nobody to charge'
);

select ok(pg_temp.due(:'later') is null, 'a lesson more than a day away is not due yet');
select ok(pg_temp.due(:'paid') is null, 'a lesson already paid for is not charged again');
select ok(pg_temp.due(:'other_terms') is null, 'a lesson booked on other terms is never charged this way');

select is(
  (select pg_temp.due(:'later', 48) ->> 'booking_id')::uuid,
  :'later'::uuid,
  'and the window is the one asked for'
);

-- ---------------------------------------------------------------------------------------
-- A charge that could not be made.
-- ---------------------------------------------------------------------------------------
select throws_ok(
  format($$ select public.system_record_charge_failed(%L, 'bad luck') $$, :'no_card'),
  'P0001', 'VALIDATION_FAILED', 'a reason that is not one is refused'
);

select is(
  (select public.system_record_charge_failed(:'no_card', 'no_card')),
  true,
  'a lesson with no card to charge is written down as failed'
);

select is(
  (select status::text || ' ' || payment_status::text from public.bookings where id = :'no_card'),
  'confirmed failed',
  'and it stays on, owed for'
);

select is(
  (select payload ->> 'reason' from public.outbox_events
    where name = 'payment.charge_failed' and payload ->> 'booking_id' = :'no_card'),
  'no_card',
  'and both of them are to be told why'
);

select ok(pg_temp.due(:'no_card') is null, 'so it is not tried again on its own');

select is(
  (select public.system_record_charge_failed(:'no_card', 'declined')),
  false,
  'and it is written down once'
);

select * from finish();
rollback;
