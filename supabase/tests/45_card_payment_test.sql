-- Paying for a lesson by card (PAY-02, PAY-03, R-10, R-11, M3-05).
begin;
select plan(14);

select tests.create_fixture();

\set ben 'b0000000-0000-0000-0000-000000000001'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set lou 'c0000000-0000-0000-0000-000000000002'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set lesson_type 'b2000000-0000-0000-0000-000000000001'

-- A Business that can take cards, and a lesson somebody has booked.
select tests.authenticate_as(:'ben');
select public.set_payments_account(:'school', 'acct_pay');
select tests.clear_authentication();
select public.system_set_payments_state('acct_pay', true, true, true);

insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                             buffer_minutes, status, price_pence, source)
values (:'school', :'ian', :'lee', :'lesson_type',
        now() + interval '3 days', now() + interval '3 days 1 hour', 30, 'confirmed', 4200, 'self')
returning id as lesson \gset

-- ---------------------------------------------------------------------------------------
-- Holding the slot while they find a card (R-10).
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'lou');
select throws_ok(
  format($$ select public.hold_booking_for_payment(%L) $$, :'lesson'),
  '42501', null, 'nobody else can hold somebody else''s lesson'
);

select tests.clear_authentication();
select tests.authenticate_as(:'lee');

select is(
  (select public.hold_booking_for_payment(:'lesson') ->> 'held'),
  'true',
  'the learner holds their own slot while they pay'
);

select is(
  (select status::text from public.bookings where id = :'lesson'),
  'pending_payment',
  'and the lesson is waiting to be paid for'
);

select is(
  (select hold_expires_at is not null and hold_expires_at > now() from public.bookings where id = :'lesson'),
  true,
  'with a hold that runs out'
);

select is(
  (select public.set_billing_customer(:'school', 'cus_lee') is not null),
  true,
  'and their cards are kept against that Business'
);

-- ---------------------------------------------------------------------------------------
-- The money arrives (R-11).
-- ---------------------------------------------------------------------------------------
select tests.clear_authentication();

select is(
  (select public.system_process_stripe_event('evt_pay_1', 'payment_intent.succeeded', 'acct_pay',
     jsonb_build_object('id', 'pi_1', 'amount_received', 4200,
                        'metadata', jsonb_build_object('booking_id', :'lesson'))) ->> 'outcome'),
  'payment_recorded',
  'the payment is recorded'
);

select is(
  (select status::text || ' ' || payment_status::text from public.bookings where id = :'lesson'),
  'confirmed paid_card',
  'and the lesson is on, and paid'
);

select is(
  (select hold_expires_at from public.bookings where id = :'lesson'),
  null,
  'the hold is over'
);

select is(
  (select amount_pence from public.payments where provider_ref = 'pi_1'),
  4200,
  'the payment says what was paid'
);

-- ---------------------------------------------------------------------------------------
-- The same event again, and again (acceptance-06).
-- ---------------------------------------------------------------------------------------
select is(
  (select public.system_process_stripe_event('evt_pay_1', 'payment_intent.succeeded', 'acct_pay',
     jsonb_build_object('id', 'pi_1', 'amount_received', 4200,
                        'metadata', jsonb_build_object('booking_id', :'lesson'))) ->> 'outcome'),
  'duplicate',
  'the same delivery changes nothing'
);

-- A different event id carrying the same payment, which is the other way a replay arrives.
select is(
  (select public.system_process_stripe_event('evt_pay_2', 'payment_intent.succeeded', 'acct_pay',
     jsonb_build_object('id', 'pi_1', 'amount_received', 4200,
                        'metadata', jsonb_build_object('booking_id', :'lesson'))) ->> 'outcome'),
  'payment_already_recorded',
  'and the same payment under a new event id is recorded once'
);

select is(
  (select count(*)::int from public.payments where provider_ref = 'pi_1'),
  1,
  'so there is exactly one payment'
);

-- ---------------------------------------------------------------------------------------
-- A card that was refused.
-- ---------------------------------------------------------------------------------------
insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                             buffer_minutes, status, payment_status, price_pence, source, hold_expires_at)
values (:'school', :'ian', :'lou', :'lesson_type',
        now() + interval '5 days', now() + interval '5 days 1 hour', 30, 'pending_payment', 'pending', 4200,
        'self', now() + interval '15 minutes')
returning id as refused \gset

select is(
  (select public.system_process_stripe_event('evt_fail_1', 'payment_intent.payment_failed', 'acct_pay',
     jsonb_build_object('id', 'pi_2', 'amount', 4200,
                        'metadata', jsonb_build_object('booking_id', :'refused'))) ->> 'outcome'),
  'payment_failed',
  'a refused card is recorded'
);

select is(
  (select status::text || ' ' || payment_status::text from public.bookings where id = :'refused'),
  'pending_payment failed',
  'and the lesson keeps its hold until the hold itself runs out'
);

select * from finish();
rollback;
