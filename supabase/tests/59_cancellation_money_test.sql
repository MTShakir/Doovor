-- What calling a lesson off does to the money paid for it (PAY-09, R-06, R-08, M3-18,
-- acceptance-04, acceptance-05).
--
-- Each cancellation is made in a statement of its own, and what it did is read in the next one.
begin;
select plan(20);

select tests.create_fixture();

\set school 'bbbb0000-0000-0000-0000-000000000000'
\set ben 'b0000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set ivy_user 'b0000000-0000-0000-0000-000000000004'
\set lee 'c0000000-0000-0000-0000-000000000001'

select tests.authenticate_as(:'ben');
select public.set_payments_account(:'school', 'acct_cancel');
select tests.clear_authentication();
select public.system_set_payments_state('acct_cancel', true, true, true);

create or replace function pg_temp.lesson(p_hours integer)
returns uuid language sql as $$
  insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                               buffer_minutes, status, price_pence, source)
  values ('bbbb0000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000001',
          'c0000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
          now() + make_interval(hours => p_hours), now() + make_interval(hours => p_hours + 1), 30,
          'confirmed', 4200, 'instructor')
  returning id;
$$;

-- A lesson paid by card, as the webhook records it.
create or replace function pg_temp.paid_by_card(p_booking uuid, p_intent text)
returns uuid language plpgsql as $$
begin
  perform public.system_process_stripe_event('evt_' || p_intent, 'payment_intent.succeeded', 'acct_cancel',
    jsonb_build_object('id', p_intent, 'amount_received', 4200, 'metadata', jsonb_build_object('booking_id', p_booking)));
  return (select id from public.payments where provider_ref = p_intent);
end;
$$;

create or replace function pg_temp.refunds_for(p_payment uuid)
returns table (kind text, status text, amount_pence integer) language sql as $$
  select kind::text, status::text, amount_pence from public.refunds where payment_id = p_payment order by created_at;
$$;

select pg_temp.lesson(24) as late_card \gset
select pg_temp.paid_by_card(:'late_card', 'pi_late') as late_payment \gset
select pg_temp.lesson(26) as instructor_card \gset
select pg_temp.paid_by_card(:'instructor_card', 'pi_instructor') as instructor_payment \gset
select pg_temp.lesson(96) as in_time_card \gset
select pg_temp.paid_by_card(:'in_time_card', 'pi_in_time') as in_time_payment \gset

-- ---------------------------------------------------------------------------------------
-- acceptance-04: cancelled 24 hours before a card lesson, default policy, the fee is kept.
-- ---------------------------------------------------------------------------------------
select results_eq(
  format($$ select coalesce((r ->> 'cancellation_window_hours')::int, 48), coalesce((r ->> 'late_fee_percent')::int, 100)
              from (select private.booking_rules(%L) as r) as rules $$, 'b1000000-0000-0000-0000-000000000001'),
  $$ values (48, 100) $$,
  'the default policy: free up to 48 hours before, the whole fee inside that (R-06)'
);

select tests.authenticate_as(:'lee');
select public.cancel_booking(:'late_card') as late_cancel \gset
select tests.clear_authentication();

select results_eq(
  format($$ select (%1$L::jsonb ->> 'fee_pence')::int, (%1$L::jsonb ->> 'kept_pence')::int, (%1$L::jsonb ->> 'card_refund_pence')::int,
                   (select count(*)::int from public.refunds where payment_id = %2$L),
                   (select status::text from public.payments where id = %2$L) $$,
         :'late_cancel', :'late_payment'),
  $$ values (4200, 4200, 0, 0, 'paid') $$,
  'acceptance-04: the full fee is kept, and nothing is refunded'
);

select results_eq(
  format($$ select (payload ->> 'late')::boolean, (payload ->> 'minutes_before')::int, (payload ->> 'window_hours')::int,
                   (payload ->> 'fee_percent')::int, (payload ->> 'fee_pence')::int, (payload ->> 'kept_pence')::int
              from public.outbox_events where name = 'booking.cancelled' and payload ->> 'booking_id' = %L $$, :'late_card'),
  $$ values (true, 1440, 48, 100, 4200, 4200) $$,
  'acceptance-04: and the cancellation carries the policy and what came of it, for the email that explains why'
);

-- ---------------------------------------------------------------------------------------
-- acceptance-05: the instructor cancels a paid lesson, and the learner is refunded in full.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ian_user');
select public.cancel_booking(:'instructor_card', 'I am ill') as instructor_cancel \gset
select tests.clear_authentication();

select results_eq(
  format($$ select * from pg_temp.refunds_for(%L) $$, :'instructor_payment'),
  $$ values ('card', 'pending', 4200) $$,
  'acceptance-05: the whole payment goes back to the card, however late the instructor cancels (R-08)'
);

select ok(
  exists (select 1 from public.outbox_events e join public.refunds r on r.id = (e.payload ->> 'refund_id')::uuid
           where e.name = 'payment.refund' and r.payment_id = :'instructor_payment'),
  'acceptance-05: automatically, through the refund job'
);

select id as instructor_refund from public.refunds where payment_id = :'instructor_payment' \gset
select public.system_settle_refund(:'instructor_refund', 're_instructor', 'succeeded');
select results_eq(
  format($$ select p.status::text, p.refunded_pence, b.payment_status::text
              from public.payments p join public.bookings b on b.id = p.booking_id where p.id = %L $$, :'instructor_payment'),
  $$ values ('refunded', 4200, 'refunded') $$,
  'acceptance-05: and once the provider has paid it, the payment and the lesson are refunded'
);

-- ---------------------------------------------------------------------------------------
-- In time, and late at half the fee.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'lee');
select public.cancel_booking(:'in_time_card') as in_time_cancel \gset
select tests.clear_authentication();

select results_eq(
  format($$ select * from pg_temp.refunds_for(%L) $$, :'in_time_payment'),
  $$ values ('card', 'pending', 4200) $$,
  'cancelled days before, the learner gets it all back'
);

update public.businesses set settings = coalesce(settings, '{}'::jsonb) || '{"late_fee_percent": 50}' where id = :'school';
select pg_temp.lesson(20) as half_card \gset
select pg_temp.paid_by_card(:'half_card', 'pi_half') as half_payment \gset

select tests.authenticate_as(:'lee');
select public.cancel_booking(:'half_card') as half_cancel \gset
select tests.clear_authentication();

select results_eq(
  format($$ select (%L::jsonb ->> 'kept_pence')::int, r.kind::text, r.status::text, r.amount_pence
              from public.refunds r where r.payment_id = %L $$, :'half_cancel', :'half_payment'),
  $$ values (2100, 'card', 'pending', 2100) $$,
  'late at a fifty per cent policy, half is kept and half goes back'
);

select id as half_refund from public.refunds where payment_id = :'half_payment' \gset
select public.system_settle_refund(:'half_refund', 're_half', 'succeeded');
select results_eq(
  format($$ select p.status::text, p.refunded_pence, b.payment_status::text
              from public.payments p join public.bookings b on b.id = p.booking_id where p.id = %L $$, :'half_payment'),
  $$ values ('partially_refunded', 2100, 'partially_refunded') $$,
  'and the lesson says so once it has gone'
);

-- ---------------------------------------------------------------------------------------
-- Paid in cash: owed back, and marked handed back.
-- ---------------------------------------------------------------------------------------
select pg_temp.lesson(30) as cash_lesson \gset
select tests.authenticate_as(:'ian_user');
select public.record_offline_payment(:'cash_lesson', 'cash') as cash_payment \gset
select public.cancel_booking(:'cash_lesson', 'Car off the road') as cash_cancel \gset
select tests.clear_authentication();

select results_eq(
  format($$ select (%L::jsonb ->> 'offline_refund_pence')::int, r.kind::text, r.status::text, r.amount_pence
              from public.refunds r where r.payment_id = %L $$, :'cash_cancel', :'cash_payment'),
  $$ values (4200, 'offline', 'pending', 4200) $$,
  'a cash lesson the instructor cancels is owed back in full, to be handed back'
);

select tests.authenticate_as(:'lee');
select results_eq(
  format($$ select (value ->> 'refunded_pence')::int, (value ->> 'pending_refund_pence')::int,
                   (select (r ->> 'kind') from jsonb_array_elements(public.learner_balance(%1$L, %2$L) -> 'refunds') as r
                     where (r ->> 'lesson_at')::timestamptz = (select starts_at from public.bookings where id = %4$L))
              from jsonb_array_elements(public.learner_balance(%1$L, %2$L) -> 'payments') where value ->> 'id' = %3$L $$,
         :'school', :'lee', :'cash_payment', :'cash_lesson'),
  $$ values (0, 4200, 'offline') $$,
  'the balance shows the cash as owed back, against the payment and the lesson it was for'
);
select tests.clear_authentication();

select id as cash_refund from public.refunds where payment_id = :'cash_payment' \gset
select tests.authenticate_as(:'ivy_user');
select throws_ok(
  format($$ select public.settle_offline_refund(%L) $$, :'cash_refund'),
  '42501', null,
  'another instructor cannot say it was handed back'
);
select tests.authenticate_as(:'lee');
select throws_ok(
  format($$ select public.settle_offline_refund(%L) $$, :'cash_refund'),
  '42501', null,
  'nor can the learner'
);

select tests.authenticate_as(:'ian_user');
select public.settle_offline_refund(:'cash_refund');
select tests.clear_authentication();

select results_eq(
  format($$ select r.status::text, p.status::text, b.payment_status::text
              from public.refunds r join public.payments p on p.id = r.payment_id join public.bookings b on b.id = p.booking_id
             where r.id = %L $$, :'cash_refund'),
  $$ values ('succeeded', 'refunded', 'refunded') $$,
  'the instructor who taught it marks it handed back, and the payment and the lesson are refunded'
);

select tests.authenticate_as(:'ian_user');
select throws_ok(
  format($$ select public.settle_offline_refund(%L) $$, :'cash_refund'),
  'P0001', 'VALIDATION_FAILED',
  'and it cannot be handed back twice'
);
select tests.clear_authentication();

-- ---------------------------------------------------------------------------------------
-- Not paid: the fee is owed. Already refunded: nothing more goes back.
-- ---------------------------------------------------------------------------------------
select pg_temp.lesson(10) as unpaid_lesson \gset
select tests.authenticate_as(:'lee');
select public.cancel_booking(:'unpaid_lesson') as unpaid_cancel \gset
select results_eq(
  format($$ select value ->> 'status', (value ->> 'fee_pence')::int
              from jsonb_array_elements(public.learner_balance(%L, %L) -> 'lessons') where value ->> 'id' = %L $$,
         :'school', :'lee', :'unpaid_lesson'),
  $$ values ('cancelled', 2100) $$,
  'a late fee on a lesson nobody paid for is in the learner''s balance, to be owed (PAY-06)'
);
select tests.clear_authentication();

select tests.authenticate_as(:'ian_user');
select public.record_offline_payment(:'unpaid_lesson', 'cash') as fee_payment \gset
select results_eq(
  format($$ select p.amount_pence, b.payment_status::text, b.status::text,
                   (select count(*)::int from jsonb_array_elements(public.learner_balance(%L, %L) -> 'lessons') where value ->> 'id' = %L)
              from public.payments p join public.bookings b on b.id = p.booking_id where p.id = %L $$,
         :'school', :'lee', :'unpaid_lesson', :'fee_payment'),
  $$ values (2100, 'paid_cash', 'cancelled', 0) $$,
  'the fee can be paid in cash: the payment is the fee, not the lesson, and nothing is owed after'
);
select tests.clear_authentication();

-- A request, or a slot held for a card, costs nothing to let go however close it is.
create or replace function pg_temp.not_on(p_status public.booking_status, p_hours integer)
returns uuid language sql as $$
  insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                               buffer_minutes, status, price_pence, source, hold_expires_at, expires_at)
  values ('bbbb0000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000001',
          'c0000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
          now() + make_interval(hours => p_hours), now() + make_interval(hours => p_hours + 1), 30,
          p_status, 4200, 'self',
          case when p_status = 'pending_payment' then now() + interval '10 minutes' end,
          case when p_status = 'requested' then now() + interval '12 hours' end)
  returning id;
$$;
select pg_temp.not_on('requested', 3) as asked \gset
select pg_temp.not_on('pending_payment', 5) as held \gset
select tests.authenticate_as(:'lee');
select public.cancel_booking(:'asked') as asked_cancel \gset
select public.cancel_booking(:'held') as held_cancel \gset
select tests.clear_authentication();

select results_eq(
  format($$ select (%L::jsonb ->> 'late')::boolean, (%L::jsonb ->> 'fee_pence')::int, (%L::jsonb ->> 'late')::boolean,
                   (select count(*)::int from public.bookings where id in (%L, %L) and fee_pence > 0) $$,
         :'asked_cancel', :'asked_cancel', :'held_cancel', :'asked', :'held'),
  $$ values (false, 0, false, 0) $$,
  'withdrawing a request or dropping a held slot is never a late cancellation'
);

select pg_temp.lesson(40) as refunded_lesson \gset
select pg_temp.paid_by_card(:'refunded_lesson', 'pi_refunded') as refunded_payment \gset
select tests.authenticate_as(:'ben');
select public.issue_refund(:'refunded_payment', 'Goodwill before the lesson');
select tests.clear_authentication();
select tests.authenticate_as(:'ian_user');
select public.cancel_booking(:'refunded_lesson', 'Rained off');
select tests.clear_authentication();

select is(
  (select count(*)::int from public.refunds where payment_id = :'refunded_payment'),
  1,
  'money already on its way back is not sent back a second time'
);

select is(
  (select count(*)::int from public.audit_log a join public.refunds r on r.id = a.entity_id
    where a.action = 'refund.issued' and r.payment_id in (:'instructor_payment', :'in_time_payment', :'half_payment', :'cash_payment')
      and (a.after ->> 'automatic')::boolean),
  4,
  'every refund a cancellation starts is in the audit log (NFR-SEC-06)'
);

select * from finish();
rollback;
