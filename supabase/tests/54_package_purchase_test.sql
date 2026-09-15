-- Buying a package: a card payment becomes credit, once (PAY-04, PAY-12, R-11, M3-13,
-- acceptance-06). And an event from somebody else's account changes nothing (D-087).
--
-- Each event is sent in a statement of its own, and what it did is read in the next one: a
-- query in the same statement reads from before the event arrived, and would see nothing even
-- if something had been written.
begin;
select plan(22);

select tests.create_fixture();

\set ben 'b0000000-0000-0000-0000-000000000001'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set liz 'c0000000-0000-0000-0000-000000000003'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set lesson_type 'b2000000-0000-0000-0000-000000000001'

-- A school that takes cards, selling ten hours and five.
select tests.authenticate_as(:'ben');
select public.set_payments_account(:'school', 'acct_pack');
select tests.clear_authentication();
select public.system_set_payments_state('acct_pack', true, true, true);

insert into public.packages (business_id, name, minutes, price_pence, expiry_days)
values (:'school', '10 hours', 600, 38000, 365)
returning id as ten_hours \gset
insert into public.packages (business_id, name, minutes, price_pence, expiry_days)
values (:'school', '5 hours', 300, 19500, null)
returning id as five_hours \gset

-- What the webhook is sent when a package is paid for. The metadata is what the server wrote
-- when it started the payment.
create or replace function pg_temp.bought(
  p_event text, p_intent text, p_learner uuid, p_package uuid,
  p_minutes text default '600', p_expiry text default '365', p_amount integer default 38000,
  p_account text default 'acct_pack'
)
returns jsonb language sql as $$
  select public.system_process_stripe_event(p_event, 'payment_intent.succeeded', p_account,
    jsonb_build_object(
      'id', p_intent,
      'amount_received', p_amount,
      'metadata', jsonb_build_object(
        'package_id', p_package,
        'business_id', 'bbbb0000-0000-0000-0000-000000000000',
        'learner_id', p_learner,
        'minutes', p_minutes,
        'expiry_days', p_expiry,
        'starts_now', 'yes'
      )
    ));
$$;

-- ---------------------------------------------------------------------------------------
-- Once per payment (R-11, acceptance-06).
-- ---------------------------------------------------------------------------------------
select is(
  pg_temp.bought('evt_pack_1', 'pi_pack_1', :'lee', :'ten_hours') ->> 'outcome',
  'credit_added',
  'a package paid for becomes credit'
);

select results_eq(
  format($$ select pg_temp.bought('evt_pack_1', 'pi_pack_1', %L, %L) ->> 'outcome'
            union all
            select pg_temp.bought('evt_pack_1', 'pi_pack_1', %L, %L) ->> 'outcome' $$,
         :'lee', :'ten_hours', :'lee', :'ten_hours'),
  $$ values ('duplicate'), ('duplicate') $$,
  'the same event delivered twice more is recognised both times'
);

select results_eq(
  $$ select (select count(*)::int from public.payments where provider_ref = 'pi_pack_1'),
            (select count(*)::int from public.credit_lots l join public.payments p on p.id = l.payment_id
              where p.provider_ref = 'pi_pack_1'),
            (select count(*)::int from public.credit_ledger m join public.payments p on p.id = m.payment_id
              where p.provider_ref = 'pi_pack_1' and m.kind = 'purchase') $$,
  $$ values (1, 1, 1) $$,
  'acceptance-06: three deliveries of one payment make exactly one payment and one credit entry'
);

select pg_temp.bought('evt_pack_1_again', 'pi_pack_1', :'lee', :'ten_hours') ->> 'outcome' as again \gset
select results_eq(
  format($$ select %L::text,
                   (select count(*)::int from public.credit_lots l join public.payments p on p.id = l.payment_id
                     where p.provider_ref = 'pi_pack_1') $$,
         :'again'),
  $$ values ('payment_already_recorded', 1) $$,
  'and a different event about the same payment adds nothing either'
);

-- ---------------------------------------------------------------------------------------
-- What was bought.
-- ---------------------------------------------------------------------------------------
select id as lee_payment from public.payments where provider_ref = 'pi_pack_1' \gset

select results_eq(
  format($$ select minutes_total, minutes_remaining, price_pence, package_id,
                   expires_at::date = (now() + interval '365 days')::date,
                   early_start_requested_at is not null
              from public.credit_lots where payment_id = %L $$, :'lee_payment'),
  format($$ values (600, 600, 38000, %L::uuid, true, true) $$, :'ten_hours'),
  'the lot is the package: its minutes, the money that arrived, a year to use them, and the learner asking to start now'
);

select is(
  (select balance_minutes from public.credit_accounts where business_id = :'school' and learner_id = :'lee'),
  600,
  'and the learner has ten hours of credit with that school'
);

select results_eq(
  format($$ select method::text, status::text, amount_pence, booking_id, learner_id, payer_id
              from public.payments where id = %L $$, :'lee_payment'),
  format($$ values ('card', 'paid', 38000, null::uuid, %L::uuid, %L::uuid) $$, :'lee', :'lee'),
  'the payment is a card payment for no lesson in particular, by the learner'
);

select ok(
  exists (select 1 from public.audit_log a join public.credit_lots l on l.id = a.entity_id
           where a.action = 'credit.purchased' and l.payment_id = :'lee_payment'),
  'the purchase is in the audit log'
);

select ok(
  exists (select 1 from public.outbox_events
           where name = 'payment.received' and payload ->> 'payment_id' = :'lee_payment'
             and payload ? 'lot_id'),
  'and the payment is announced, for the receipt and the notices to follow'
);

select throws_ok(
  format($$ update public.credit_lots set early_start_requested_at = null where payment_id = %L $$, :'lee_payment'),
  '42501', 'what a credit lot was bought as cannot change',
  'when the learner asked to start is part of what they bought, and stays as it was'
);

-- ---------------------------------------------------------------------------------------
-- Terms that are not the usual ones.
-- ---------------------------------------------------------------------------------------
select is(
  pg_temp.bought('evt_pack_2', 'pi_pack_2', :'lee', :'five_hours', '300', '', 19500) ->> 'outcome',
  'credit_added',
  'a package with no time limit is bought'
);
select is(
  (select expires_at from public.credit_lots l join public.payments p on p.id = l.payment_id
    where p.provider_ref = 'pi_pack_2'),
  null,
  'and its hours never run out'
);

delete from public.packages where id = :'five_hours';
select pg_temp.bought('evt_pack_3', 'pi_pack_3', :'lee', :'five_hours', '300', '', 19500) ->> 'outcome' as gone \gset
select results_eq(
  format($$ select %L::text,
                   (select package_id from public.credit_lots l join public.payments p on p.id = l.payment_id
                     where p.provider_ref = 'pi_pack_3'),
                   (select minutes_total from public.credit_lots l join public.payments p on p.id = l.payment_id
                     where p.provider_ref = 'pi_pack_3') $$,
         :'gone'),
  $$ values ('credit_added', null::uuid, 300) $$,
  'a package taken off sale while somebody was paying still gives them what they were shown'
);

-- ---------------------------------------------------------------------------------------
-- Money that cannot become credit.
-- ---------------------------------------------------------------------------------------
select pg_temp.bought('evt_pack_liz', 'pi_pack_liz', :'liz', :'ten_hours') ->> 'outcome' as not_a_learner \gset
select results_eq(
  format($$ select %L::text,
                   (select count(*)::int from public.refunds r join public.payments p on p.id = r.payment_id
                     where p.provider_ref = 'pi_pack_liz' and r.amount_pence = 38000 and r.kind = 'card'),
                   (select count(*)::int from public.credit_accounts where learner_id = %L) $$,
         :'not_a_learner', :'liz'),
  $$ values ('payment_refunded', 1, 0) $$,
  'somebody who does not learn with the school gets their money back, and no credit (PAY-12)'
);

select pg_temp.bought('evt_pack_bad', 'pi_pack_bad', :'lee', :'ten_hours', 'ten') ->> 'outcome' as nonsense \gset
select results_eq(
  format($$ select %L::text, (select count(*)::int from public.payments where provider_ref = 'pi_pack_bad') $$,
         :'nonsense'),
  $$ values ('metadata_invalid', 0) $$,
  'a payment whose metadata makes no sense is recorded as such, and changes nothing'
);

select public.system_process_stripe_event('evt_pack_refused', 'payment_intent.payment_failed', 'acct_pack',
         jsonb_build_object('id', 'pi_pack_refused', 'amount', 38000,
                            'metadata', jsonb_build_object('package_id', 'x',
                                                           'business_id', 'bbbb0000-0000-0000-0000-000000000000'))
       ) ->> 'outcome' as refused \gset
select results_eq(
  format($$ select %L::text, (select count(*)::int from public.payments where provider_ref = 'pi_pack_refused') $$,
         :'refused'),
  $$ values ('package_payment_failed', 0) $$,
  'a card refused for a package writes nothing down: the learner saw it happen'
);

-- ---------------------------------------------------------------------------------------
-- An event from another account is not this Business's money (D-087).
-- ---------------------------------------------------------------------------------------
select pg_temp.bought('evt_pack_elsewhere', 'pi_pack_elsewhere', :'lee', :'ten_hours', '600', '365', 38000,
                      'acct_somebody_else') ->> 'outcome' as elsewhere \gset
select results_eq(
  format($$ select %L::text, (select count(*)::int from public.payments where provider_ref = 'pi_pack_elsewhere') $$,
         :'elsewhere'),
  $$ values ('account_mismatch', 0) $$,
  'a package payment from an account that is not the school''s buys nothing'
);

insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                             buffer_minutes, status, price_pence, source)
values (:'school', :'ian', :'lee', :'lesson_type',
        now() + interval '4 days', now() + interval '4 days 1 hour', 30, 'confirmed', 4200, 'self')
returning id as lesson \gset

select public.system_process_stripe_event('evt_lesson_elsewhere', 'payment_intent.succeeded', 'acct_somebody_else',
         jsonb_build_object('id', 'pi_lesson_elsewhere', 'amount_received', 4200,
                            'metadata', jsonb_build_object('booking_id', :'lesson'))) ->> 'outcome' as lesson_elsewhere \gset
select results_eq(
  format($$ select %L::text, (select payment_status::text from public.bookings where id = %L) $$,
         :'lesson_elsewhere', :'lesson'),
  $$ values ('account_mismatch', 'unpaid') $$,
  'a lesson is not marked paid by money that went to somebody else''s account'
);

select is(
  (public.system_process_stripe_event('evt_cancel_elsewhere', 'payment_intent.canceled', 'acct_somebody_else',
     jsonb_build_object('id', 'pi_pack_1'))) ->> 'outcome',
  'account_mismatch',
  'and a payment is not called off from another account either'
);

select is(
  (public.system_process_stripe_event('evt_lesson_here', 'payment_intent.succeeded', 'acct_pack',
     jsonb_build_object('id', 'pi_lesson_here', 'amount_received', 4200,
                        'metadata', jsonb_build_object('booking_id', :'lesson')))) ->> 'outcome',
  'payment_recorded',
  'while the school''s own account still pays for its lesson'
);

-- ---------------------------------------------------------------------------------------
-- Nobody makes credit for themselves.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'lee');
select throws_ok(
  format($$ select public.system_record_package_payment('pi_free', 'acct_pack',
              jsonb_build_object('business_id', %L, 'learner_id', %L, 'minutes', '6000'), 1) $$,
         :'school', :'lee'),
  '42501', null,
  'a learner cannot record a package payment of their own'
);
select throws_ok(
  format($$ select private.add_credit_lot(%L, %L, 6000, 0, null, null, null, null, null) $$, :'school', :'lee'),
  '42501', null,
  'or add a lot of credit directly'
);

select * from finish();
rollback;
