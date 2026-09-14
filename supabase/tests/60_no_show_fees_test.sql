-- No-show fees, and fees charged to a kept card (PAY-09, R-09, M3-19).
--
-- Each no-show, cancellation or payment is made in a statement of its own, and what it did is
-- read in the next one.
begin;
select plan(24);

select tests.create_fixture();

\set school 'bbbb0000-0000-0000-0000-000000000000'
\set ben 'b0000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set lee 'c0000000-0000-0000-0000-000000000001'

select tests.authenticate_as(:'ben');
select public.set_payments_account(:'school', 'acct_noshow');
select tests.clear_authentication();
select public.system_set_payments_state('acct_noshow', true, true, true);

-- A lesson starting some hours from now: below zero for one that has already started.
create or replace function pg_temp.lesson(p_hours numeric)
returns uuid language sql as $$
  insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                               buffer_minutes, status, price_pence, source)
  values ('bbbb0000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000001',
          'c0000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
          now() + make_interval(mins => (p_hours * 60)::int), now() + make_interval(mins => (p_hours * 60)::int + 60), 30,
          'confirmed', 4200, 'instructor')
  returning id;
$$;

create or replace function pg_temp.paid_by_card(p_booking uuid, p_intent text, p_amount integer default 4200)
returns uuid language plpgsql as $$
begin
  perform public.system_process_stripe_event('evt_' || p_intent, 'payment_intent.succeeded', 'acct_noshow',
    jsonb_build_object('id', p_intent, 'amount_received', p_amount, 'metadata', jsonb_build_object('booking_id', p_booking)));
  return (select id from public.payments where provider_ref = p_intent);
end;
$$;

create or replace function pg_temp.set_policy(p_settings jsonb)
returns void language sql as $$
  update public.businesses
     set settings = (coalesce(settings, '{}'::jsonb) - 'late_fee_percent' - 'payment_mode') || p_settings
   where id = 'bbbb0000-0000-0000-0000-000000000000';
$$;

-- A package bought, and the purchase that filled it.
create or replace function pg_temp.buy(p_minutes integer, p_pence integer)
returns uuid language plpgsql as $$
declare
  v_payment uuid;
  v_lot uuid;
begin
  insert into public.payments (business_id, learner_id, amount_pence, method, status, paid_at)
  values ('bbbb0000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001', p_pence, 'card', 'paid', now())
  returning id into v_payment;
  insert into public.credit_accounts (business_id, learner_id)
  values ('bbbb0000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001')
  on conflict (business_id, learner_id) do nothing;
  insert into public.credit_lots (business_id, learner_id, payment_id, minutes_total, price_pence, purchased_at)
  values ('bbbb0000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001', v_payment, p_minutes, p_pence, now())
  returning id into v_lot;
  insert into public.credit_ledger (business_id, learner_id, lot_id, kind, minutes, payment_id)
  values ('bbbb0000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001', v_lot, 'purchase', p_minutes, v_payment);
  return v_lot;
end;
$$;

create or replace function pg_temp.fee_charges(p_booking uuid)
returns integer language sql as $$
  select count(*)::int from public.outbox_events where name = 'payment.fee_charge' and payload ->> 'booking_id' = p_booking::text;
$$;

-- ---------------------------------------------------------------------------------------
-- Paid by card: the fee comes out of what was paid (R-09, PAY-09).
-- ---------------------------------------------------------------------------------------
select pg_temp.lesson(-1) as card_whole \gset
select pg_temp.paid_by_card(:'card_whole', 'pi_whole') as card_whole_payment \gset
select tests.authenticate_as(:'ian_user');
select public.mark_no_show(:'card_whole', 'Waited twenty minutes') as card_whole_result \gset
select tests.clear_authentication();

select results_eq(
  format($$ select (%1$L::jsonb ->> 'fee_pence')::int, (%1$L::jsonb ->> 'kept_pence')::int, (%1$L::jsonb ->> 'charging')::boolean,
                   (select count(*)::int from public.refunds where payment_id = %2$L),
                   (select payment_status::text from public.bookings where id = %3$L) $$,
         :'card_whole_result', :'card_whole_payment', :'card_whole'),
  $$ values (4200, 4200, false, 0, 'paid_card') $$,
  'a card lesson nobody came to keeps the whole fee at the default policy, as a late cancellation does'
);

select results_eq(
  format($$ select dispute_until = now() + interval '7 days', status::text, late_cancellation
              from public.bookings where id = %L $$, :'card_whole'),
  $$ values (true, 'no_show', true) $$,
  'and the learner can dispute it for seven days, which the lesson records (R-09)'
);

select results_eq(
  format($$ select (payload ->> 'kept_pence')::int, (payload ->> 'fee_percent')::int, (payload ->> 'dispute_until')::timestamptz = now() + interval '7 days'
              from public.outbox_events where name = 'booking.no_show' and payload ->> 'booking_id' = %L $$, :'card_whole'),
  $$ values (4200, 100, true) $$,
  'the no-show event carries the fee, the policy and the dispute window, for the learner''s email'
);

select pg_temp.set_policy('{"late_fee_percent": 50}');
select pg_temp.lesson(-3) as card_half \gset
select pg_temp.paid_by_card(:'card_half', 'pi_half') as card_half_payment \gset
select tests.authenticate_as(:'ian_user');
select public.mark_no_show(:'card_half') as card_half_result \gset
select tests.clear_authentication();

select results_eq(
  format($$ select r.kind::text, r.status::text, r.amount_pence, (%L::jsonb ->> 'card_refund_pence')::int
              from public.refunds r where r.payment_id = %L $$, :'card_half_result', :'card_half_payment'),
  $$ values ('card', 'pending', 2100, 2100) $$,
  'at a fifty per cent policy half is kept and half goes back to the card'
);

-- ---------------------------------------------------------------------------------------
-- Paid with credit: the credit pays the fee (R-07).
-- ---------------------------------------------------------------------------------------
select pg_temp.buy(120, 7600) as lot \gset
select pg_temp.lesson(-5) as by_credit \gset
select private.pay_with_credit(:'by_credit', null);
select tests.authenticate_as(:'ian_user');
select public.mark_no_show(:'by_credit') as by_credit_result \gset
select tests.clear_authentication();

select results_eq(
  format($$ select (%1$L::jsonb ->> 'credit_kept_minutes')::int, (%1$L::jsonb ->> 'credit_returned_minutes')::int,
                   (select payment_status::text from public.bookings where id = %2$L),
                   (select coalesce(-sum(minutes), 0)::int from public.credit_ledger where booking_id = %2$L and kind = 'fee') $$,
         :'by_credit_result', :'by_credit'),
  $$ values (30, 30, 'partially_refunded', 30) $$,
  'a credit lesson nobody came to keeps half its minutes as the fee at a fifty per cent policy, and gives the rest back'
);

-- ---------------------------------------------------------------------------------------
-- Not paid: the fee goes to the kept card, when there is one to charge (PAY-09).
-- ---------------------------------------------------------------------------------------
select pg_temp.set_policy('{}');
select pg_temp.lesson(-7) as no_card \gset
select tests.authenticate_as(:'ian_user');
select public.mark_no_show(:'no_card') as no_card_result \gset
select tests.clear_authentication();

select results_eq(
  format($$ select (%L::jsonb ->> 'charging')::boolean, pg_temp.fee_charges(%L) $$, :'no_card_result', :'no_card'),
  $$ values (false, 0) $$,
  'a learner the Business keeps no card for is not charged: the fee is owed'
);

select tests.authenticate_as(:'lee');
select results_eq(
  format($$ select value ->> 'status', (value ->> 'fee_pence')::int
              from jsonb_array_elements(public.learner_balance(%L, %L) -> 'lessons') where value ->> 'id' = %L $$,
         :'school', :'lee', :'no_card'),
  $$ values ('no_show', 4200) $$,
  'and it is in the balance, for the learner and the Business alike (PAY-06)'
);
select tests.clear_authentication();

insert into public.billing_customers (business_id, learner_id, provider_customer_id) values (:'school', :'lee', 'cus_lee');

select pg_temp.lesson(-9) as to_charge \gset
select tests.authenticate_as(:'ian_user');
select public.mark_no_show(:'to_charge') as to_charge_result \gset
select tests.clear_authentication();

select results_eq(
  format($$ select (%L::jsonb ->> 'charging')::boolean, pg_temp.fee_charges(%L) $$, :'to_charge_result', :'to_charge'),
  $$ values (true, 1) $$,
  'with a card kept, the fee job is asked to charge it'
);

select is(
  public.system_fee_to_charge(:'to_charge'),
  jsonb_build_object('booking_id', :'to_charge'::uuid, 'business_id', :'school'::uuid, 'account_id', 'acct_noshow',
                     'customer_id', 'cus_lee', 'amount_pence', 4200, 'kind', 'no_show'),
  'and is told what to charge, to which account and customer'
);

select pg_temp.lesson(30) as cancelled_late \gset
select tests.authenticate_as(:'lee');
select public.cancel_booking(:'cancelled_late') as cancelled_late_result \gset
select tests.clear_authentication();

select results_eq(
  format($$ select (%L::jsonb ->> 'fee_pence')::int, (%L::jsonb ->> 'charging')::boolean, pg_temp.fee_charges(%L) $$,
         :'cancelled_late_result', :'cancelled_late_result', :'cancelled_late'),
  $$ values (4200, true, 1) $$,
  'a lesson called off late that nobody paid for has its fee charged to the kept card too'
);

select pg_temp.set_policy('{"payment_mode": "offline"}');
select pg_temp.lesson(-11) as in_person \gset
select tests.authenticate_as(:'ian_user');
select public.mark_no_show(:'in_person') as in_person_result \gset
select tests.clear_authentication();
select pg_temp.set_policy('{}');

select results_eq(
  format($$ select (%L::jsonb ->> 'charging')::boolean, pg_temp.fee_charges(%L) $$, :'in_person_result', :'in_person'),
  $$ values (false, 0) $$,
  'a Business whose learners pay in person charges no card, whatever is kept'
);

-- ---------------------------------------------------------------------------------------
-- A card that will not pay.
-- ---------------------------------------------------------------------------------------
select ok(public.system_record_fee_charge_failed(:'cancelled_late', 'declined'), 'a refused fee charge is recorded');

select results_eq(
  format($$ select b.payment_status::text, e.payload ->> 'reason', (e.payload ->> 'fee')::boolean
              from public.bookings b
              join public.outbox_events e on e.name = 'payment.charge_failed' and e.payload ->> 'booking_id' = b.id::text
             where b.id = %L $$, :'cancelled_late'),
  $$ values ('failed', 'declined', true) $$,
  'the fee stays owed as failed, and both sides are told why'
);

select is(public.system_record_fee_charge_failed(:'cancelled_late', 'declined'), false, 'and told once');
select is(public.system_fee_to_charge(:'cancelled_late'), null, 'a failed fee is not charged again with nobody there');

select throws_ok(
  format($$ select public.system_record_fee_charge_failed(%L, 'no_card') $$, :'to_charge'),
  'P0001', 'VALIDATION_FAILED',
  'no card to charge is not a failure to tell anybody about'
);

-- ---------------------------------------------------------------------------------------
-- Money that arrives for a fee pays it.
-- ---------------------------------------------------------------------------------------
select pg_temp.paid_by_card(:'to_charge', 'pi_fee') as fee_payment \gset

select results_eq(
  format($$ select b.payment_status::text, (select count(*)::int from public.refunds where payment_id = %L),
                   (select count(*)::int from public.outbox_events where name = 'payment.received' and payload ->> 'payment_id' = %L)
              from public.bookings b where b.id = %L $$, :'fee_payment', :'fee_payment', :'to_charge'),
  $$ values ('paid_card', 0, 1) $$,
  'a card payment for a no-show fee pays the fee, and is a payment received'
);

select is(public.system_fee_to_charge(:'to_charge'), null, 'so there is nothing left to charge');

select pg_temp.paid_by_card(:'cancelled_late', 'pi_failed_fee') as failed_fee_payment \gset
select is(
  (select payment_status::text from public.bookings where id = :'cancelled_late'),
  'paid_card',
  'a fee whose charge failed can still be paid on screen'
);

select pg_temp.set_policy('{"late_fee_percent": 50}');
select pg_temp.lesson(-13) as over_paid \gset
select tests.authenticate_as(:'ian_user');
select public.mark_no_show(:'over_paid');
select tests.clear_authentication();
select pg_temp.set_policy('{}');
select pg_temp.paid_by_card(:'over_paid', 'pi_over', 4200) as over_payment \gset

select results_eq(
  format($$ select r.amount_pence, r.status::text, r.reason, b.payment_status::text
              from public.refunds r join public.bookings b on b.id = r.booking_id where r.payment_id = %L $$, :'over_payment'),
  $$ values (2100, 'pending', 'More than the fee was paid', 'paid_card') $$,
  'paying the whole price for a half fee pays the fee and sends the rest back'
);

select pg_temp.paid_by_card(:'card_whole', 'pi_twice') as twice_payment \gset
select is(
  (select count(*)::int from public.refunds where payment_id = :'twice_payment' and amount_pence = 4200),
  1,
  'money for a fee the lesson''s own payment already covers goes back in full'
);

-- ---------------------------------------------------------------------------------------
-- Paid in person, and nobody else asks.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ian_user');
select public.record_offline_payment(:'no_card', 'bank') as bank_fee \gset
select tests.clear_authentication();

select results_eq(
  format($$ select p.amount_pence, b.payment_status::text from public.payments p join public.bookings b on b.id = p.booking_id where p.id = %L $$, :'bank_fee'),
  $$ values (4200, 'paid_bank') $$,
  'a no-show fee can be paid by bank transfer, recorded by the instructor'
);

select tests.authenticate_as(:'lee');
select throws_ok(
  format($$ select public.system_fee_to_charge(%L) $$, :'no_card'),
  '42501', null,
  'a learner cannot ask what the fee job would charge'
);
select throws_ok(
  format($$ select public.system_record_fee_charge_failed(%L, 'declined') $$, :'no_card'),
  '42501', null,
  'nor record a charge as failed'
);
select tests.clear_authentication();

select * from finish();
rollback;
