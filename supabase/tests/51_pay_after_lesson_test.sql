-- Paying for a lesson after it has happened (PAY-03, M3-10).
begin;
select plan(7);

select tests.create_fixture();

\set ben 'b0000000-0000-0000-0000-000000000001'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set lou 'c0000000-0000-0000-0000-000000000002'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set lesson_type 'b2000000-0000-0000-0000-000000000001'

select tests.authenticate_as(:'ben');
select public.set_payments_account(:'school', 'acct_after');
select public.set_payment_mode(:'school', 'after_lesson');
select tests.clear_authentication();
select public.system_set_payments_state('acct_after', true, true, true);

-- A lesson that started an hour ago, booked to be paid afterwards.
insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                             buffer_minutes, status, payment_mode, price_pence, source)
values (:'school', :'ian', :'lee', :'lesson_type', now() - interval '1 hour', now(), 30, 'confirmed',
        'after_lesson', 4200, 'instructor')
returning id as lesson \gset

select tests.authenticate_as(:'ian_user');
select public.complete_booking(:'lesson');
select tests.clear_authentication();

-- ---------------------------------------------------------------------------------------
-- What the notice about it knows.
-- ---------------------------------------------------------------------------------------
select is(
  (select public.system_booking_notice(:'lesson') ->> 'payment_mode'),
  'after_lesson',
  'the notice about a finished lesson says it is paid for afterwards'
);

select is(
  (select (public.system_booking_notice(:'lesson') ->> 'payment_status') || ' '
          || (public.system_booking_notice(:'lesson') ->> 'price_pence')),
  'unpaid 4200',
  'and that it is still to pay, and how much'
);

select is(
  (select count(*)::int from public.outbox_events
    where name = 'booking.completed' and payload ->> 'booking_id' = :'lesson'),
  1,
  'and marking it done is what sets the request to pay going'
);

-- ---------------------------------------------------------------------------------------
-- Paying for it once it has happened.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'lou');
select throws_ok(
  format($$ select public.hold_booking_for_payment(%L) $$, :'lesson'),
  '42501', null, 'nobody else can start paying for it'
);
select tests.clear_authentication();

select tests.authenticate_as(:'lee');
select is(
  (select public.hold_booking_for_payment(:'lesson') ->> 'held'),
  'false',
  'the learner can pay for a lesson that has happened, with nothing to hold'
);
select tests.clear_authentication();

select is(
  (select status::text || ' ' || payment_status::text from public.bookings where id = :'lesson'),
  'completed unpaid',
  'and it stays a finished lesson while they do'
);

select public.system_process_stripe_event('evt_after', 'payment_intent.succeeded', 'acct_after',
  jsonb_build_object('id', 'pi_after', 'amount_received', 4200, 'metadata', jsonb_build_object('booking_id', :'lesson')));

select is(
  (select status::text || ' ' || payment_status::text from public.bookings where id = :'lesson'),
  'completed paid_card',
  'and the payment marks it paid'
);

select * from finish();
rollback;
