-- A lesson paid for twice gives the second payment back (R-10, R-11, PAY-07, M3-07).
begin;
select plan(11);

select tests.create_fixture();

\set ben 'b0000000-0000-0000-0000-000000000001'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set lou 'c0000000-0000-0000-0000-000000000002'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set lesson_type 'b2000000-0000-0000-0000-000000000001'

select tests.authenticate_as(:'ben');
select public.set_payments_account(:'school', 'acct_twice');
select tests.clear_authentication();
select public.system_set_payments_state('acct_twice', true, true, true);

insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                             buffer_minutes, status, price_pence, source)
values (:'school', :'ian', :'lee', :'lesson_type',
        now() + interval '6 days', now() + interval '6 days 1 hour', 30, 'confirmed', 4200, 'self')
returning id as lesson \gset

-- ---------------------------------------------------------------------------------------
-- The first payment is the lesson's.
-- ---------------------------------------------------------------------------------------
select is(
  (select public.system_process_stripe_event('evt_first', 'payment_intent.succeeded', 'acct_twice',
     jsonb_build_object('id', 'pi_first', 'amount_received', 4200,
                        'metadata', jsonb_build_object('booking_id', :'lesson'))) ->> 'outcome'),
  'payment_recorded',
  'the first payment for a lesson pays for it'
);

-- ---------------------------------------------------------------------------------------
-- A second payment for the same lesson, from another tab or another card.
-- ---------------------------------------------------------------------------------------
select is(
  (select public.system_process_stripe_event('evt_second', 'payment_intent.succeeded', 'acct_twice',
     jsonb_build_object('id', 'pi_second', 'amount_received', 4200,
                        'metadata', jsonb_build_object('booking_id', :'lesson'))) ->> 'outcome'),
  'payment_refunded',
  'a second payment for a lesson that is already paid for is given back'
);

select is(
  (select r.status::text || ' ' || r.amount_pence::text || ' ' || r.reason
     from public.refunds r
     join public.payments p on p.id = r.payment_id
    where p.provider_ref = 'pi_second'),
  'pending 4200 This lesson had already been paid for',
  'all of it, and the refund says why'
);

select is(
  (select count(*)::int from public.refunds r join public.payments p on p.id = r.payment_id
    where p.provider_ref = 'pi_first'),
  0,
  'and the payment that got there first is kept'
);

select is(
  (select status::text || ' ' || payment_status::text from public.bookings where id = :'lesson'),
  'confirmed paid_card',
  'so the lesson is still on, and still paid'
);

-- ---------------------------------------------------------------------------------------
-- The second payment arriving again.
-- ---------------------------------------------------------------------------------------
select is(
  (select public.system_process_stripe_event('evt_second_again', 'payment_intent.succeeded', 'acct_twice',
     jsonb_build_object('id', 'pi_second', 'amount_received', 4200,
                        'metadata', jsonb_build_object('booking_id', :'lesson'))) ->> 'outcome'),
  'payment_already_recorded',
  'the same second payment under a new event id is not refunded twice'
);

select is(
  (select count(*)::int from public.refunds where booking_id = :'lesson'),
  1,
  'so there is exactly one refund'
);

-- ---------------------------------------------------------------------------------------
-- Sending it.
-- ---------------------------------------------------------------------------------------
select id as refund from public.refunds where booking_id = :'lesson' \gset

select is(
  (select public.system_settle_refund(:'refund', 're_second') ->> 'status'),
  'succeeded',
  'the refund is settled'
);

select is(
  (select status::text from public.payments where provider_ref = 'pi_second'),
  'refunded',
  'the second payment says it went back'
);

select is(
  (select payment_status::text from public.bookings where id = :'lesson'),
  'paid_card',
  'and the lesson is still paid for, because the first payment is still there'
);

-- ---------------------------------------------------------------------------------------
-- A card payment for a lesson that was paid for in cash.
-- ---------------------------------------------------------------------------------------
insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                             buffer_minutes, status, payment_status, price_pence, source)
values (:'school', :'ian', :'lou', :'lesson_type',
        now() + interval '8 days', now() + interval '8 days 1 hour', 30, 'confirmed', 'paid_cash', 4200, 'self')
returning id as cash_lesson \gset

select is(
  (select public.system_process_stripe_event('evt_after_cash', 'payment_intent.succeeded', 'acct_twice',
     jsonb_build_object('id', 'pi_after_cash', 'amount_received', 4200,
                        'metadata', jsonb_build_object('booking_id', :'cash_lesson'))) ->> 'outcome'),
  'payment_refunded',
  'a card payment for a lesson already paid in cash is given back too'
);

select * from finish();
rollback;
