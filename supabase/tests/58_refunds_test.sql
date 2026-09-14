-- Refunds: back the way the money came or as credit, by the people who may, reconciled with the
-- provider (PAY-07, NFR-SEC-06, R-11, M3-17).
--
-- Each refund or event is made in a statement of its own, and what it did is read in the next.
begin;
select plan(24);

select tests.create_fixture();

\set school 'bbbb0000-0000-0000-0000-000000000000'
\set ben 'b0000000-0000-0000-0000-000000000001'
\set manager_user 'b0000000-0000-0000-0000-000000000002'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set ivy_user 'b0000000-0000-0000-0000-000000000004'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set otto 'd0000000-0000-0000-0000-000000000001'
\set lesson_type 'b2000000-0000-0000-0000-000000000001'

select tests.authenticate_as(:'ben');
select public.set_payments_account(:'school', 'acct_refunds');
select tests.clear_authentication();
select public.system_set_payments_state('acct_refunds', true, true, true);

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

-- What the provider says about a refund, as the webhook passes it on.
create or replace function pg_temp.provider_refund(p_event text, p_type text, p_refund jsonb, p_account text default 'acct_refunds')
returns text language sql as $$
  select public.system_process_stripe_event(p_event, p_type, p_account, p_refund) ->> 'outcome';
$$;

create or replace function pg_temp.drift()
returns integer language sql as $$
  select (
    (select count(*) from public.credit_accounts a
      where a.balance_minutes <> coalesce((select sum(m.minutes) from public.credit_ledger m
                                            where m.business_id = a.business_id and m.learner_id = a.learner_id), 0))
    + (select count(*) from public.credit_lots l
        where l.minutes_remaining <> coalesce((select sum(m.minutes) from public.credit_ledger m where m.lot_id = l.id), 0))
  )::int;
$$;

-- A lesson paid by card, one paid in cash, a third paid by card, and ten hours of credit bought
-- by card with one of them used.
select pg_temp.lesson(48) as card_lesson \gset
select pg_temp.lesson(72) as cash_lesson \gset
select pg_temp.lesson(96) as other_lesson \gset
select public.system_process_stripe_event('evt_card', 'payment_intent.succeeded', 'acct_refunds',
         jsonb_build_object('id', 'pi_card', 'amount_received', 4200,
                            'metadata', jsonb_build_object('booking_id', :'card_lesson')));
select public.system_process_stripe_event('evt_other', 'payment_intent.succeeded', 'acct_refunds',
         jsonb_build_object('id', 'pi_other', 'amount_received', 4200,
                            'metadata', jsonb_build_object('booking_id', :'other_lesson')));
select public.system_process_stripe_event('evt_package', 'payment_intent.succeeded', 'acct_refunds',
         jsonb_build_object('id', 'pi_package', 'amount_received', 38000,
                            'metadata', jsonb_build_object('package_id', null, 'business_id', :'school',
                                                           'learner_id', :'lee', 'minutes', '600')));
select tests.authenticate_as(:'ian_user');
select public.record_offline_payment(:'cash_lesson', 'cash') as cash_payment \gset
select tests.clear_authentication();

select id as card_payment from public.payments where provider_ref = 'pi_card' \gset
select id as other_payment from public.payments where provider_ref = 'pi_other' \gset
select id as package_payment from public.payments where provider_ref = 'pi_package' \gset
select id as package_lot from public.credit_lots where payment_id = :'package_payment' \gset
insert into public.credit_ledger (business_id, learner_id, lot_id, kind, minutes, booking_id)
values (:'school', :'lee', :'package_lot', 'use', -60, :'other_lesson');

-- ---------------------------------------------------------------------------------------
-- Who may give money back (PRD 6.2).
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ian_user');
select throws_ok(
  format($$ select public.issue_refund(%L, 'Goodwill') $$, :'card_payment'),
  '42501', null,
  'a school instructor cannot refund, not even for their own lesson'
);
select throws_ok(
  format($$ select public.refund_options(%L) $$, :'card_payment'),
  '42501', null,
  'or see what could be refunded'
);

select tests.authenticate_as(:'lee');
select throws_ok(
  format($$ select public.issue_refund(%L, 'I want it back') $$, :'card_payment'),
  '42501', null,
  'nor can the learner refund themselves'
);

select tests.authenticate_as(:'otto');
select throws_ok(
  format($$ select public.issue_refund(%L, 'Why not') $$, :'card_payment'),
  '42501', null,
  'nor anybody with no part in it'
);

-- ---------------------------------------------------------------------------------------
-- A lesson paid by card, back to the card.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ben');
select throws_ok(
  format($$ select public.issue_refund(%L, '   ') $$, :'card_payment'),
  'P0001', 'VALIDATION_FAILED',
  'a refund says why'
);
select public.issue_refund(:'card_payment', 'Lesson ran short', 1000) as part_refund \gset
select tests.clear_authentication();

select results_eq(
  format($$ select r.kind::text, r.status::text, r.amount_pence, r.requested_by, p.refunded_pence, p.status::text
              from public.refunds r join public.payments p on p.id = r.payment_id where r.id = %L $$, :'part_refund'),
  format($$ values ('card', 'pending', 1000, %L::uuid, 0, 'paid') $$, :'ben'),
  'the owner refunds part of it to the card: written down as waiting, and nothing counted back yet'
);

select ok(
  exists (select 1 from public.outbox_events where name = 'payment.refund' and payload ->> 'refund_id' = :'part_refund')
  and exists (select 1 from public.audit_log where action = 'refund.issued' and entity_id = :'part_refund'
                                               and actor_user_id = :'ben' and after ->> 'reason' = 'Lesson ran short'),
  'it goes to the job that sends it, and into the audit log with who and why (NFR-SEC-06)'
);

select tests.authenticate_as(:'ben');
select is(
  (public.refund_options(:'card_payment') ->> 'refundable_pence')::int,
  3200,
  'while it is waiting, it counts against what else can be given back'
);
select throws_ok(
  format($$ select public.issue_refund(%L, 'Too much', 3300) $$, :'card_payment'),
  'P0001', 'VALIDATION_FAILED',
  'so more than is left cannot be refunded'
);
select tests.clear_authentication();

select public.system_settle_refund(:'part_refund', 're_part', 'succeeded');
select results_eq(
  format($$ select p.refunded_pence, p.status::text, b.payment_status::text
              from public.payments p join public.bookings b on b.id = p.booking_id where p.id = %L $$, :'card_payment'),
  $$ values (1000, 'partially_refunded', 'partially_refunded') $$,
  'once the provider pays it, the payment and the lesson say part of it went back'
);

select pg_temp.provider_refund('evt_part_failed', 'refund.updated',
         jsonb_build_object('id', 're_part', 'status', 'failed', 'amount', 1000, 'payment_intent', 'pi_card',
                            'metadata', jsonb_build_object('refund_id', :'part_refund'))) as part_failed \gset
select results_eq(
  format($$ select %L::text, (select status::text from public.refunds where id = %L),
                   p.refunded_pence, p.status::text, b.payment_status::text
              from public.payments p join public.bookings b on b.id = p.booking_id where p.id = %L $$,
         :'part_failed', :'part_refund', :'card_payment'),
  $$ values ('refund_failed', 'failed', 0, 'paid', 'paid_card') $$,
  'a refund the provider later says failed is counted back: the lesson is paid again'
);

-- ---------------------------------------------------------------------------------------
-- A lesson paid in cash, handed back.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'manager_user');
select public.issue_refund(:'cash_payment', 'Lesson cancelled by the school') as cash_refund \gset
select tests.clear_authentication();

select results_eq(
  format($$ select r.kind::text, r.status::text, r.amount_pence, p.status::text, b.payment_status::text
              from public.refunds r join public.payments p on p.id = r.payment_id join public.bookings b on b.id = p.booking_id
             where r.id = %L $$, :'cash_refund'),
  $$ values ('offline', 'succeeded', 4200, 'refunded', 'refunded') $$,
  'a manager refunds a cash lesson in full: handed back in person, so done as soon as it is written down'
);

-- ---------------------------------------------------------------------------------------
-- A lesson refunded as credit.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ben');
select public.issue_refund(:'card_payment', 'Taken as credit instead', null, null, 'credit') as credit_refund \gset
select tests.clear_authentication();

select results_eq(
  format($$ select r.kind::text, r.status::text, r.amount_pence, l.minutes_total, l.minutes_remaining, l.price_pence
              from public.refunds r
              join public.credit_ledger m on m.refund_id = r.id and m.kind = 'adjustment'
              join public.credit_lots l on l.id = m.lot_id
             where r.id = %L $$, :'credit_refund'),
  $$ values ('credit', 'succeeded', 4200, 60, 60, 4200) $$,
  'the rest of a card lesson refunded as credit is an hour to book with, worth what was given back'
);

select results_eq(
  format($$ select p.refunded_pence, p.status::text from public.payments p where p.id = %L $$, :'card_payment'),
  $$ values (4200, 'refunded') $$,
  'and the payment is refunded, with no money sent anywhere'
);

-- ---------------------------------------------------------------------------------------
-- Credit bought and not used, back as money.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ben');
select results_eq(
  format($$ select (%1$L::jsonb -> 'lot' ->> 'usable_minutes')::int, (%1$L::jsonb -> 'lot' ->> 'value_pence')::int $$,
         public.refund_options(:'package_payment')),
  $$ values (540, 34200) $$,
  'what is left of ten hours for £380 after one is used is nine hours, worth £342'
);
select throws_ok(
  format($$ select public.issue_refund(%L, 'Money', 5000) $$, :'package_payment'),
  'P0001', 'VALIDATION_FAILED',
  'credit is refunded by the minute, not by an amount'
);
select throws_ok(
  format($$ select public.issue_refund(%L, 'Too many', null, 541) $$, :'package_payment'),
  'P0001', 'VALIDATION_FAILED',
  'and not by more minutes than are left'
);
select public.issue_refund(:'package_payment', 'Moving away', null, 120) as package_refund \gset
select tests.clear_authentication();

select results_eq(
  format($$ select r.kind::text, r.status::text, r.amount_pence,
                   (select minutes from public.credit_ledger where refund_id = r.id and kind = 'refund'),
                   (select minutes_remaining from public.credit_lots where id = %L)
              from public.refunds r where r.id = %L $$, :'package_lot', :'package_refund'),
  $$ values ('card', 'pending', 7600, -120, 420) $$,
  'two hours go back to the card at the price they were bought for, and leave the balance at once'
);

select pg_temp.provider_refund('evt_package_failed', 'refund.failed',
         jsonb_build_object('id', 're_package', 'status', 'failed', 'amount', 7600, 'payment_intent', 'pi_package',
                            'metadata', jsonb_build_object('refund_id', :'package_refund'))) as package_failed \gset
select results_eq(
  format($$ select %L::text, (select minutes_remaining from public.credit_lots where id = %L),
                   (select count(*)::int from public.credit_ledger where refund_id = %L and kind = 'adjustment') $$,
         :'package_failed', :'package_lot', :'package_refund'),
  $$ values ('refund_failed', 540, 1) $$,
  'if the provider cannot pay it, the two hours come back'
);

select public.system_settle_refund(:'package_refund', 're_package', 'failed');
select is(
  (select count(*)::int from public.credit_ledger where refund_id = :'package_refund' and kind = 'adjustment'),
  1,
  'and hearing it again puts nothing back twice'
);

-- ---------------------------------------------------------------------------------------
-- Refunds the provider tells us about.
-- ---------------------------------------------------------------------------------------
select pg_temp.provider_refund('evt_dashboard', 'refund.created',
         jsonb_build_object('id', 're_dashboard', 'status', 'succeeded', 'amount', 4200, 'payment_intent', 'pi_other',
                            'metadata', '{}'::jsonb)) as dashboard \gset
select results_eq(
  format($$ select %L::text, r.kind::text, r.status::text, r.amount_pence, r.requested_by, p.status::text
              from public.refunds r join public.payments p on p.id = r.payment_id
             where r.provider_ref = 're_dashboard' $$, :'dashboard'),
  $$ values ('refund_succeeded', 'card', 'succeeded', 4200, null::uuid, 'refunded') $$,
  'a refund made in the provider''s own dashboard is written down and counted'
);

select pg_temp.provider_refund('evt_dashboard_again', 'refund.updated',
         jsonb_build_object('id', 're_dashboard', 'status', 'succeeded', 'amount', 4200, 'payment_intent', 'pi_other',
                            'metadata', '{}'::jsonb)) as dashboard_again \gset
select results_eq(
  format($$ select %L::text, (select count(*)::int from public.refunds where provider_ref = 're_dashboard') $$, :'dashboard_again'),
  $$ values ('already_settled', 1) $$,
  'and hearing about it again does not count it twice'
);

select pg_temp.provider_refund('evt_elsewhere', 'refund.created',
         jsonb_build_object('id', 're_elsewhere', 'status', 'succeeded', 'amount', 100, 'payment_intent', 'pi_card',
                            'metadata', '{}'::jsonb), 'acct_somebody_else') as elsewhere \gset
select results_eq(
  format($$ select %L::text, (select count(*)::int from public.refunds where provider_ref = 're_elsewhere') $$, :'elsewhere'),
  $$ values ('account_mismatch', 0) $$,
  'a refund reported from somebody else''s account changes nothing (D-087)'
);

select is(pg_temp.drift(), 0, 'and through all of it every balance is still the sum of its ledger');

select * from finish();
rollback;
