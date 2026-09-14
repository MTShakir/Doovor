-- Holds that run out, and money that arrives too late (R-10, PAY-03, PAY-07, M3-06).
--
-- The clock is faked by moving the hold into the past, which is the only thing the sweep
-- looks at. Everything else happens in the order it would in life.
begin;
select plan(22);

select tests.create_fixture();

\set ben 'b0000000-0000-0000-0000-000000000001'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set lou 'c0000000-0000-0000-0000-000000000002'
\set liz 'c0000000-0000-0000-0000-000000000003'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set lesson_type 'b2000000-0000-0000-0000-000000000001'

-- A Business that can take cards, working hours every day and a price to book against.
select tests.authenticate_as(:'ben');
select public.set_payments_account(:'school', 'acct_hold');
select tests.clear_authentication();
select public.system_set_payments_state('acct_hold', true, true, true);

insert into public.working_hours (instructor_id, business_id, weekday, start_time, end_time)
select :'ian', :'school', d, '06:00', '22:00' from generate_series(1, 7) as d;
insert into public.lesson_prices (business_id, lesson_type_id, duration_minutes, price_pence)
values (:'school', :'lesson_type', 60, 4200);

select (date_trunc('day', now()) + interval '3 days 10 hours') as slot_a \gset
select (date_trunc('day', now()) + interval '4 days 10 hours') as slot_b \gset

-- ---------------------------------------------------------------------------------------
-- A lesson that has to be paid for starts out held (PAY-03).
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'lee');
select public.create_booking(:'ian', :'lee', :'lesson_type', :'slot_a'::timestamptz, 60) as lesson_a \gset

select is(
  (select status::text from public.bookings where id = :'lesson_a'),
  'pending_payment',
  'a learner booking a Business that takes cards holds the slot rather than confirming it'
);

select is(
  (select hold_expires_at > now() from public.bookings where id = :'lesson_a'),
  true,
  'and the hold runs out'
);

select is(
  (select payment_mode::text from public.bookings where id = :'lesson_a'),
  'at_booking',
  'and the lesson says how it is being paid for'
);

select tests.clear_authentication();
select tests.authenticate_as(:'ian_user');
select public.create_booking(:'ian', :'lee', :'lesson_type',
       (:'slot_a'::timestamptz + interval '4 hours'), 60) as by_instructor \gset

select is(
  (select status::text from public.bookings where id = :'by_instructor'),
  'confirmed',
  'an instructor booking for their own learner is not sitting at a card, so nothing is held'
);

-- ---------------------------------------------------------------------------------------
-- The attempt is written down, so it can be called off (R-10).
-- ---------------------------------------------------------------------------------------
select tests.clear_authentication();
select tests.authenticate_as(:'lee');
select public.set_payment_intent(:'lesson_a', 'pi_hold_a', 4200) as payment_a \gset

select is(
  (select status::text from public.payments where id = :'payment_a'),
  'pending',
  'the payment a learner is about to make is written down first'
);

select tests.clear_authentication();
select tests.authenticate_as(:'lou');
select throws_ok(
  format($$ select public.set_payment_intent(%L, 'pi_someone_else', 4200) $$, :'lesson_a'),
  '42501', null, 'nobody else can put an attempt against somebody''s lesson'
);
select tests.clear_authentication();

-- ---------------------------------------------------------------------------------------
-- A hold that is still good is left alone.
-- ---------------------------------------------------------------------------------------
select public.system_expire_payment_holds();

select is(
  (select status::text from public.bookings where id = :'lesson_a'),
  'pending_payment',
  'a sweep leaves a hold that has not run out where it is'
);

-- ---------------------------------------------------------------------------------------
-- A hold that has run out gives the slot back.
-- ---------------------------------------------------------------------------------------
update public.bookings set hold_expires_at = now() - interval '1 minute' where id = :'lesson_a';
select public.system_expire_payment_holds() as sweep_a \gset

select is(
  (select status::text from public.bookings where id = :'lesson_a'),
  'expired',
  'a hold that has run out puts the time back in the diary'
);

select is(
  (select payment_status::text || ' ' || coalesce(hold_expires_at::text, 'none')
     from public.bookings where id = :'lesson_a'),
  'unpaid none',
  'and the lesson owes nothing and holds nothing'
);

select is(
  (select count(*)::int
     from jsonb_array_elements((:'sweep_a')::jsonb -> 'cancel') as one
    where one ->> 'intent_id' = 'pi_hold_a'
      and one ->> 'account_id' = 'acct_hold'),
  1,
  'and the sweep says which attempt to call off, and on whose account'
);

-- ---------------------------------------------------------------------------------------
-- Money that arrives just too late, with nobody else in the slot (R-10).
-- ---------------------------------------------------------------------------------------
select is(
  (select public.system_record_card_payment('pi_hold_a', :'lesson_a', 4200) ->> 'outcome'),
  'revived',
  'a payment that lands after the hold ran out gets the lesson back, if the slot is still free'
);

select is(
  (select status::text || ' ' || payment_status::text from public.bookings where id = :'lesson_a'),
  'confirmed paid_card',
  'and the lesson is on, and paid'
);

select is(
  (select count(*)::int from public.refunds where booking_id = :'lesson_a'),
  0,
  'and nothing is given back, because they got what they paid for'
);

-- ---------------------------------------------------------------------------------------
-- Money that arrives after somebody else has taken the slot.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'lou');
select public.create_booking(:'ian', :'lou', :'lesson_type', :'slot_b'::timestamptz, 60) as lesson_b \gset
select public.set_payment_intent(:'lesson_b', 'pi_hold_b', 4200) as payment_b \gset
select tests.clear_authentication();

update public.bookings set hold_expires_at = now() - interval '1 minute' where id = :'lesson_b';
select public.system_expire_payment_holds();

select is(
  (select public.system_record_payment_cancelled(:'payment_b')),
  true,
  'the attempt behind a lapsed hold is called off'
);

select is(
  (select public.system_record_payment_cancelled(:'payment_b')),
  false,
  'and calling it off again changes nothing'
);

-- Somebody else takes the time while all that is going on.
insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                             buffer_minutes, status, price_pence, source)
values (:'school', :'ian', :'liz', :'lesson_type', :'slot_b'::timestamptz,
        :'slot_b'::timestamptz + interval '1 hour', 30, 'confirmed', 4200, 'self');

select is(
  (select public.system_process_stripe_event('evt_late_b', 'payment_intent.succeeded', 'acct_hold',
     jsonb_build_object('id', 'pi_hold_b', 'amount_received', 4200,
                        'metadata', jsonb_build_object('booking_id', :'lesson_b'))) ->> 'outcome'),
  'payment_refunded',
  'a payment for a slot somebody else now has is refunded'
);

select is(
  (select status::text from public.bookings where id = :'lesson_b'),
  'expired',
  'and the lesson stays gone, because the time is not theirs to have'
);

select is(
  (select status::text || ' ' || amount_pence::text from public.refunds where booking_id = :'lesson_b'),
  'pending 4200',
  'and all of it is waiting to go back'
);

select id as refund_b from public.refunds where booking_id = :'lesson_b' \gset

-- ---------------------------------------------------------------------------------------
-- Sending the refund, once (PAY-07).
-- ---------------------------------------------------------------------------------------
select is(
  (select public.system_settle_refund(:'refund_b', 're_late_b') ->> 'status'),
  'succeeded',
  'the refund the provider took is written down'
);

select is(
  (select status::text || ' ' || refunded_pence::text from public.payments where id = :'payment_b'),
  'refunded 4200',
  'and the payment says the money went back'
);

select is(
  (select public.system_settle_refund(:'refund_b', 're_again') ->> 'reason'),
  'already_settled',
  'and a second attempt at the same refund changes nothing'
);

select is(
  (select provider_ref from public.refunds where id = :'refund_b'),
  're_late_b',
  'so the refund keeps the id it was sent under'
);

select * from finish();
rollback;
