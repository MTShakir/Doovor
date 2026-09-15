-- Cash and bank transfers, recorded in two taps (PAY-05, R-10, M3-15).
--
-- Each recording is made in a statement of its own, and what it did is read in the next one.
begin;
select plan(21);

select tests.create_fixture();

\set school 'bbbb0000-0000-0000-0000-000000000000'
\set ben 'b0000000-0000-0000-0000-000000000001'
\set manager_user 'b0000000-0000-0000-0000-000000000002'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set ivy_user 'b0000000-0000-0000-0000-000000000004'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set lesson_type 'b2000000-0000-0000-0000-000000000001'

-- The school takes cards too, so a card payment can land on a lesson already paid in cash.
select tests.authenticate_as(:'ben');
select public.set_payments_account(:'school', 'acct_offline');
select tests.clear_authentication();
select public.system_set_payments_state('acct_offline', true, true, true);

create or replace function pg_temp.lesson(p_days integer, p_status text, p_price integer default 4200)
returns uuid language sql as $$
  insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                               buffer_minutes, status, price_pence, source, hold_expires_at, expires_at)
  values ('bbbb0000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000001',
          'c0000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
          now() + make_interval(days => p_days), now() + make_interval(days => p_days, hours => 1), 30,
          p_status::public.booking_status, p_price, 'instructor',
          case when p_status = 'pending_payment' then now() + interval '15 minutes' end,
          case when p_status = 'requested' then now() + interval '6 hours' end)
  returning id;
$$;

select pg_temp.lesson(3, 'confirmed') as cash_lesson \gset
select pg_temp.lesson(4, 'confirmed') as bank_lesson \gset
select pg_temp.lesson(5, 'pending_payment') as held_lesson \gset
select pg_temp.lesson(-2, 'completed') as taught_lesson \gset
select pg_temp.lesson(6, 'cancelled') as off_lesson \gset
select pg_temp.lesson(7, 'requested') as asked_lesson \gset
select pg_temp.lesson(8, 'confirmed', 0) as free_lesson \gset
select pg_temp.lesson(9, 'confirmed') as managed_lesson \gset

-- ---------------------------------------------------------------------------------------
-- Recording it (PAY-05).
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ian_user');
select public.record_offline_payment(:'cash_lesson', 'cash') as cash_payment \gset
select tests.clear_authentication();

select results_eq(
  format($$ select b.payment_status::text, p.method::text, p.provider, p.amount_pence, p.status::text, p.booking_id
              from public.bookings b join public.payments p on p.booking_id = b.id
             where p.id = %L $$, :'cash_payment'),
  format($$ values ('paid_cash', 'cash', 'offline', 4200, 'paid', %L::uuid) $$, :'cash_lesson'),
  'the instructor records a lesson paid in cash, for its price, and the lesson is paid'
);

select ok(
  exists (select 1 from public.audit_log where action = 'payment.recorded' and entity_id = :'cash_payment')
  and exists (select 1 from public.outbox_events
               where name = 'payment.received' and payload ->> 'payment_id' = :'cash_payment'),
  'it is in the audit log and announced, as any payment is'
);

select tests.authenticate_as(:'ian_user');
select throws_ok(
  format($$ select public.record_offline_payment(%L, 'bank') $$, :'cash_lesson'),
  'P0001', 'VALIDATION_FAILED',
  'a lesson already paid for cannot be paid for again'
);

select public.record_offline_payment(:'bank_lesson', 'bank') as bank_payment \gset
select public.record_offline_payment(:'held_lesson', 'cash') as held_payment \gset
select public.record_offline_payment(:'taught_lesson', 'cash') as taught_payment \gset
select tests.clear_authentication();

select results_eq(
  format($$ select id, payment_status::text from public.bookings where id in (%L, %L) order by starts_at $$,
         :'bank_lesson', :'taught_lesson'),
  format($$ values (%L::uuid, 'paid_cash'), (%L::uuid, 'paid_bank') $$, :'taught_lesson', :'bank_lesson'),
  'a bank transfer shows as one, and a lesson that has already happened can be paid for afterwards'
);

select results_eq(
  format($$ select status::text, hold_expires_at, payment_status::text from public.bookings where id = %L $$, :'held_lesson'),
  $$ values ('confirmed', null::timestamptz, 'paid_cash') $$,
  'a lesson held while a card was found is simply confirmed once it is paid in cash'
);

select tests.authenticate_as(:'ian_user');
select throws_ok(
  format($$ select public.record_offline_payment(%L, 'cash') $$, :'off_lesson'),
  'P0001', 'VALIDATION_FAILED',
  'a lesson that is not going ahead is not paid for like this'
);
select throws_ok(
  format($$ select public.record_offline_payment(%L, 'cash') $$, :'asked_lesson'),
  'P0001', 'VALIDATION_FAILED',
  'nor is a request, which is not a lesson yet'
);
select throws_ok(
  format($$ select public.record_offline_payment(%L, 'cash') $$, :'free_lesson'),
  'P0001', 'VALIDATION_FAILED',
  'nor a free lesson, which has nothing to pay'
);
select throws_ok(
  format($$ select public.record_offline_payment(%L, 'cheque') $$, :'managed_lesson'),
  'P0001', 'VALIDATION_FAILED',
  'and a payment is cash or a bank transfer, nothing else'
);

-- ---------------------------------------------------------------------------------------
-- Who records it.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ivy_user');
select throws_ok(
  format($$ select public.record_offline_payment(%L, 'cash') $$, :'managed_lesson'),
  '42501', null,
  'another instructor cannot record a payment for somebody else''s lesson'
);

select tests.authenticate_as(:'lee');
select throws_ok(
  format($$ select public.record_offline_payment(%L, 'cash') $$, :'managed_lesson'),
  '42501', null,
  'and a learner cannot mark their own lesson paid'
);

select tests.clear_authentication();
select is(
  (select count(*)::int from public.payments where booking_id in (:'off_lesson', :'asked_lesson', :'free_lesson', :'managed_lesson')),
  0,
  'and nothing that was refused wrote a payment down'
);

select tests.authenticate_as(:'manager_user');
select public.record_offline_payment(:'managed_lesson', 'bank') as managed_payment \gset
select tests.clear_authentication();

select is(
  (select payment_status::text from public.bookings where id = :'managed_lesson'),
  'paid_bank',
  'somebody who manages the bookings can'
);

-- ---------------------------------------------------------------------------------------
-- A card payment that lands afterwards is given back (R-10).
-- ---------------------------------------------------------------------------------------
select public.system_process_stripe_event('evt_card_after_cash', 'payment_intent.succeeded', 'acct_offline',
         jsonb_build_object('id', 'pi_after_cash', 'amount_received', 4200,
                            'metadata', jsonb_build_object('booking_id', :'cash_lesson'))) ->> 'outcome' as card_after \gset

select results_eq(
  format($$ select %L::text, (select payment_status::text from public.bookings where id = %L),
                   (select count(*)::int from public.refunds r join public.payments p on p.id = r.payment_id
                     where p.provider_ref = 'pi_after_cash') $$,
         :'card_after', :'cash_lesson'),
  $$ values ('payment_refunded', 'paid_cash', 1) $$,
  'a card payment arriving for a lesson paid in cash is refunded, and the lesson stays paid in cash'
);

-- ---------------------------------------------------------------------------------------
-- Undo, straight away.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'lee');
select throws_ok(
  format($$ select public.undo_offline_payment(%L) $$, :'taught_payment'),
  '42501', null,
  'a learner cannot take a payment back out'
);

select tests.authenticate_as(:'ian_user');
select public.undo_offline_payment(:'bank_payment') as undone \gset
select tests.clear_authentication();

select results_eq(
  format($$ select %L::uuid, (select payment_status::text from public.bookings where id = %L),
                   (select count(*)::int from public.payments where id = %L),
                   (select count(*)::int from public.audit_log where action = 'payment.undone' and entity_id = %L) $$,
         :'undone', :'bank_lesson', :'bank_payment', :'bank_payment'),
  format($$ values (%L::uuid, 'unpaid', 0, 1) $$, :'bank_lesson'),
  'the instructor takes a payment tapped by mistake straight back out, and the lesson is unpaid again'
);

select tests.authenticate_as(:'ian_user');
select throws_ok(
  format($$ select public.undo_offline_payment(%L) $$, :'bank_payment'),
  '42501', null,
  'a payment already taken out is not there to take out again'
);

select public.record_offline_payment(:'bank_lesson', 'cash') as second_try \gset
select tests.clear_authentication();

select is(
  (select payment_status::text from public.bookings where id = :'bank_lesson'),
  'paid_cash',
  'and then records it as it really was paid'
);

update public.payments set created_at = now() - interval '11 minutes' where id = :'second_try';

select tests.authenticate_as(:'ian_user');
select throws_ok(
  format($$ select public.undo_offline_payment(%L) $$, :'second_try'),
  'P0001', 'VALIDATION_FAILED',
  'after ten minutes a payment is a record like any other, and putting it right is a refund'
);

select throws_ok(
  $$ select public.undo_offline_payment((select id from public.payments where provider_ref = 'pi_after_cash')) $$,
  '42501', null,
  'and a card payment is never taken out this way'
);

select tests.clear_authentication();
insert into public.refunds (business_id, payment_id, learner_id, kind, amount_pence, reason)
values (:'school', :'cash_payment', :'lee', 'card', 1000, 'Part of it given back');

select tests.authenticate_as(:'ian_user');
select throws_ok(
  format($$ select public.undo_offline_payment(%L) $$, :'cash_payment'),
  'P0001', 'VALIDATION_FAILED',
  'nor an offline payment that already has a refund against it'
);
select tests.clear_authentication();

select * from finish();
rollback;
