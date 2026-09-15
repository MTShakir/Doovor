-- Disputing a no-show, and deciding the dispute (R-09, M3-19).
--
-- Each no-show, dispute or decision is made in a statement of its own, and what it did is read
-- in the next one.
begin;
select plan(19);

select tests.create_fixture();

\set school 'bbbb0000-0000-0000-0000-000000000000'
\set ben 'b0000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set ivy_user 'b0000000-0000-0000-0000-000000000004'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set lou 'c0000000-0000-0000-0000-000000000002'

select tests.authenticate_as(:'ben');
select public.set_payments_account(:'school', 'acct_dispute');
select tests.clear_authentication();
select public.system_set_payments_state('acct_dispute', true, true, true);

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

create or replace function pg_temp.no_show(p_booking uuid)
returns void language plpgsql as $$
begin
  perform tests.authenticate_as('b0000000-0000-0000-0000-000000000003');
  perform public.mark_no_show(p_booking);
  perform tests.clear_authentication();
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Raising one (R-09).
-- ---------------------------------------------------------------------------------------
select pg_temp.lesson(-2) as unpaid \gset
select pg_temp.no_show(:'unpaid');
select pg_temp.lesson(4) as still_on \gset

select tests.authenticate_as(:'lee');
select public.dispute_no_show(:'unpaid', '  I was there at nine, and waited at the usual corner  ') as unpaid_dispute \gset
select tests.clear_authentication();

select results_eq(
  format($$ select d.reason, d.learner_id, d.outcome is null,
                   (select count(*)::int from public.outbox_events where name = 'booking.disputed' and payload ->> 'dispute_id' = d.id::text)
              from public.no_show_disputes d where d.id = %L $$, :'unpaid_dispute'),
  format($$ values ('I was there at nine, and waited at the usual corner', %L::uuid, true, 1) $$, :'lee'),
  'the learner disputes a no-show within the seven days, in their own words, and the Business is told'
);

select tests.authenticate_as(:'lee');
select throws_ok(
  format($$ select public.dispute_no_show(%L, 'Again') $$, :'unpaid'),
  'P0001', 'VALIDATION_FAILED',
  'once'
);
select throws_ok(
  format($$ select public.dispute_no_show(%L, 'Not a no-show') $$, :'still_on'),
  'P0001', 'VALIDATION_FAILED',
  'only a lesson marked as a no-show can be disputed'
);
select throws_ok(
  format($$ select public.dispute_no_show(%L, '   ') $$, :'unpaid'),
  'P0001', 'VALIDATION_FAILED',
  'saying what happened is required'
);
select tests.clear_authentication();

select pg_temp.lesson(-4) as too_late \gset
select pg_temp.no_show(:'too_late');
update public.bookings set dispute_until = now() - interval '1 minute' where id = :'too_late';
select tests.authenticate_as(:'lee');
select throws_ok(
  format($$ select public.dispute_no_show(%L, 'A week and a day later') $$, :'too_late'),
  'P0001', 'VALIDATION_FAILED',
  'not once the seven days are over'
);

select tests.authenticate_as(:'lou');
select throws_ok(
  format($$ select public.dispute_no_show(%L, 'Not my lesson') $$, :'unpaid'),
  '42501', null,
  'nobody disputes somebody else''s lesson'
);
select throws_ok(
  $$ insert into public.no_show_disputes (business_id, booking_id, learner_id, reason)
     values ('bbbb0000-0000-0000-0000-000000000000', gen_random_uuid(), 'c0000000-0000-0000-0000-000000000002', 'Direct') $$,
  '42501', null,
  'and nobody writes a dispute directly'
);

-- ---------------------------------------------------------------------------------------
-- Who sees it.
-- ---------------------------------------------------------------------------------------
select is((select count(*)::int from public.no_show_disputes where id = :'unpaid_dispute'), 0, 'another learner cannot read it');
select tests.authenticate_as(:'lee');
select is((select count(*)::int from public.no_show_disputes where id = :'unpaid_dispute'), 1, 'the learner who raised it can');
select tests.authenticate_as(:'ian_user');
select is((select count(*)::int from public.no_show_disputes where id = :'unpaid_dispute'), 1, 'so can the instructor whose lesson it was');
select tests.authenticate_as(:'ivy_user');
select is((select count(*)::int from public.no_show_disputes where id = :'unpaid_dispute'), 0, 'but not another instructor at the school');
select tests.authenticate_as(:'ben');
select is((select count(*)::int from public.no_show_disputes where id = :'unpaid_dispute'), 1, 'and the owner can');

-- ---------------------------------------------------------------------------------------
-- Deciding it.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ian_user');
select throws_ok(
  format($$ select public.decide_no_show_dispute(%L, 'waived') $$, :'unpaid_dispute'),
  '42501', null,
  'a school instructor cannot decide: waiving is giving money back (PRD 6.2)'
);

select tests.authenticate_as(:'ben');
select public.decide_no_show_dispute(:'unpaid_dispute', 'waived', 'Sorry, our mistake');
select tests.clear_authentication();

select results_eq(
  format($$ select b.fee_pence, d.outcome::text, d.note, d.decided_by,
                   public.system_fee_to_charge(b.id) is null
              from public.no_show_disputes d join public.bookings b on b.id = d.booking_id where d.id = %L $$, :'unpaid_dispute'),
  format($$ values (0, 'waived', 'Sorry, our mistake', %L::uuid, true) $$, :'ben'),
  'waiving a fee nobody paid leaves nothing owed and nothing to charge'
);

select tests.authenticate_as(:'lee');
select is(
  (select count(*)::int from jsonb_array_elements(public.learner_balance(:'school', :'lee') -> 'lessons') where value ->> 'id' = :'unpaid'),
  0,
  'and it is out of the balance'
);
select tests.authenticate_as(:'ben');
select throws_ok(
  format($$ select public.decide_no_show_dispute(%L, 'kept') $$, :'unpaid_dispute'),
  'P0001', 'VALIDATION_FAILED',
  'a dispute is decided once'
);
select tests.clear_authentication();

-- Paid by card, fee kept, then waived: the money goes back to the card.
select pg_temp.lesson(-6) as by_card \gset
select public.system_process_stripe_event('evt_pi_disputed', 'payment_intent.succeeded', 'acct_dispute',
  jsonb_build_object('id', 'pi_disputed', 'amount_received', 4200, 'metadata', jsonb_build_object('booking_id', :'by_card')));
select pg_temp.no_show(:'by_card');
select tests.authenticate_as(:'lee');
select public.dispute_no_show(:'by_card', 'I cancelled by text the night before') as card_dispute \gset
select tests.authenticate_as(:'ben');
select public.decide_no_show_dispute(:'card_dispute', 'waived') as card_decision \gset
select tests.clear_authentication();

select results_eq(
  format($$ select (%L::jsonb ->> 'card_refund_pence')::int, r.kind::text, r.status::text, r.amount_pence,
                   (select count(*)::int from public.outbox_events where name = 'payment.refund' and payload ->> 'refund_id' = r.id::text)
              from public.refunds r join public.payments p on p.id = r.payment_id where p.provider_ref = 'pi_disputed' $$, :'card_decision'),
  $$ values (4200, 'card', 'pending', 4200, 1) $$,
  'a waived fee kept from a card payment goes back to the card, through the refund job'
);

-- Paid with credit, fee kept, then waived: the minutes come back.
select pg_temp.buy(60, 3800) as lot \gset
select pg_temp.lesson(-8) as by_credit \gset
select private.pay_with_credit(:'by_credit', null);
select pg_temp.no_show(:'by_credit');
select tests.authenticate_as(:'lee');
select public.dispute_no_show(:'by_credit', 'My instructor told me not to come') as credit_dispute \gset
select tests.authenticate_as(:'ben');
select public.decide_no_show_dispute(:'credit_dispute', 'waived') as credit_decision \gset
select tests.clear_authentication();

select results_eq(
  format($$ select (%L::jsonb ->> 'credit_returned_minutes')::int,
                   (select minutes_remaining from public.credit_lots where id = %L),
                   (select payment_status::text from public.bookings where id = %L),
                   (select count(*)::int from public.credit_ledger where booking_id = %L and kind = 'adjustment' and actor_id = %L and reason is not null) $$,
         :'credit_decision', :'lot', :'by_credit', :'by_credit', :'ben'),
  $$ values (60, 60, 'refunded', 1) $$,
  'a waived fee kept from credit gives the minutes back to their lot, by hand, with who and why'
);

-- Kept: nothing changes but the dispute.
select pg_temp.lesson(-10) as kept \gset
select pg_temp.no_show(:'kept');
select tests.authenticate_as(:'lee');
select public.dispute_no_show(:'kept', 'I was ill') as kept_dispute \gset
select tests.authenticate_as(:'ben');
select public.decide_no_show_dispute(:'kept_dispute', 'kept', 'Please cancel in time next time');
select tests.clear_authentication();

select results_eq(
  format($$ select b.fee_pence, b.payment_status::text, d.outcome::text,
                   (select count(*)::int from public.outbox_events where name = 'booking.dispute_decided' and payload ->> 'dispute_id' = d.id::text)
              from public.no_show_disputes d join public.bookings b on b.id = d.booking_id where d.id = %L $$, :'kept_dispute'),
  $$ values (4200, 'unpaid', 'kept', 1) $$,
  'keeping the fee leaves it owed, and the learner is told'
);

select * from finish();
rollback;
