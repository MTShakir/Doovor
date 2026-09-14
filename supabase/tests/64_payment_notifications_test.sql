-- Who payment notifications concern (NTF-03, M3-22).
begin;
select plan(16);

select tests.create_fixture();

\set asha_biz 'aaaa0000-0000-0000-0000-000000000000'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set ben 'b0000000-0000-0000-0000-000000000001'
\set manager 'b0000000-0000-0000-0000-000000000002'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set lou 'c0000000-0000-0000-0000-000000000002'

create or replace function pg_temp.lesson(p_learner uuid, p_starts timestamptz, p_status text, p_payment text, p_mode text default 'at_booking')
returns uuid language sql as $$
  insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                               buffer_minutes, status, payment_status, payment_mode, price_pence, source)
  values ('bbbb0000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000001', p_learner,
          'b2000000-0000-0000-0000-000000000001', p_starts, p_starts + interval '1 hour', 0,
          p_status::public.booking_status, p_payment::public.booking_payment_status,
          p_mode::public.booking_payment_mode, 4200, 'instructor')
  returning id;
$$;

-- The sweeps look across every Business; these tests look at the fixture school's part of them.
create or replace function pg_temp.overdue()
returns setof uuid language sql as $$
  select (o.value ->> 'booking_id')::uuid
    from jsonb_array_elements(public.system_overdue_lessons()) as o
    join public.bookings b on b.id = (o.value ->> 'booking_id')::uuid
   where b.business_id = 'bbbb0000-0000-0000-0000-000000000000';
$$;

-- ---------------------------------------------------------------------------------------
-- A payment received.
-- ---------------------------------------------------------------------------------------
select pg_temp.lesson(:'lee', now() - interval '1 hour', 'completed', 'paid_card') as paid_lesson \gset
insert into public.payments (business_id, learner_id, booking_id, amount_pence, method, status, paid_at)
values (:'school', :'lee', :'paid_lesson', 4200, 'card', 'paid', now()) returning id as lesson_payment \gset

select results_eq(
  format($$ select (n ->> 'amount_pence')::int, n ->> 'method', (n ->> 'instructor_user_id')::uuid,
                   n ->> 'instructor_name', (n ->> 'learner_user_id')::uuid, n ->> 'credit_minutes', n ->> 'recorded_by'
              from (select public.system_payment_notice(%L) as n) as notice $$, :'lesson_payment'),
  format($$ values (4200, 'card', %L::uuid, 'Ian', %L::uuid, null::text, null::text) $$, :'ian_user', :'lee'),
  'a payment for a lesson concerns the learner and the instructor who taught it'
);

insert into public.payments (business_id, learner_id, amount_pence, method, status, paid_at)
values (:'school', :'lou', 38000, 'cash', 'paid', now()) returning id as package_payment \gset
insert into public.credit_accounts (business_id, learner_id) values (:'school', :'lou');
insert into public.credit_lots (business_id, learner_id, payment_id, minutes_total, price_pence)
values (:'school', :'lou', :'package_payment', 180, 38000) returning id as lou_lot \gset
insert into public.credit_ledger (business_id, learner_id, lot_id, kind, minutes, payment_id)
values (:'school', :'lou', :'lou_lot', 'purchase', 180, :'package_payment');

select results_eq(
  format($$ select (n ->> 'credit_minutes')::int, n ->> 'instructor_name' from (select public.system_payment_notice(%L) as n) as notice $$, :'package_payment'),
  $$ values (180, 'Ivy') $$,
  'credit bought concerns the learner and the instructor they learn with'
);

select is(public.system_payment_notice(gen_random_uuid()), null, 'a payment that is not there concerns nobody');

select results_eq(
  format($$ select (s ->> 'business_id')::uuid, (s ->> 'total_pence')::int, (s ->> 'count')::int, s -> 'user_ids'
              from jsonb_array_elements(public.system_daily_payment_summaries(now() - interval '1 day', now() + interval '1 minute')) as s
             where (s ->> 'business_id')::uuid = %L $$, :'school'),
  format($$ values (%L::uuid, 42200, 2, jsonb_build_array(%L, %L)) $$, :'school', :'ben', :'manager'),
  'the day''s summary is for schools, to their owners and managers'
);

insert into public.payments (business_id, learner_id, amount_pence, method, status, paid_at)
values (:'asha_biz', :'lee', 4000, 'cash', 'paid', now());
select is(
  (select count(*)::int from jsonb_array_elements(public.system_daily_payment_summaries(now() - interval '1 day', now() + interval '1 minute'))
    where (value ->> 'business_id')::uuid = :'asha_biz'),
  0,
  'and not for somebody running a Business of one, who hears about each payment'
);

-- Cash marked paid by the instructor who taught the lesson.
select pg_temp.lesson(:'lee', now() - interval '2 hours', 'completed', 'unpaid') as cash_lesson \gset
select tests.authenticate_as(:'ian_user');
select public.record_offline_payment(:'cash_lesson', 'cash') as cash_payment \gset
select tests.clear_authentication();

select is(
  (public.system_payment_notice(:'cash_payment') ->> 'wait_until')::timestamptz,
  now() + interval '10 minutes',
  'money marked paid in person is told about once it can no longer be taken back out'
);

update public.payments set created_at = now() - interval '11 minutes' where id = :'cash_payment';
select results_eq(
  format($$ select n ->> 'method', (n ->> 'recorded_by')::uuid, n ? 'wait_until' from (select public.system_payment_notice(%L) as n) as notice $$, :'cash_payment'),
  format($$ values ('cash', %L::uuid, false) $$, :'ian_user'),
  'and says who marked it paid, who knows already'
);

-- A no-show fee paid by card, a few hours after the lesson nobody came to.
select pg_temp.lesson(:'lee', now() - interval '3 hours', 'no_show', 'unpaid') as missed_today \gset
update public.bookings set fee_pence = 2100 where id = :'missed_today';
insert into public.payments (business_id, learner_id, booking_id, amount_pence, method, status, paid_at)
values (:'school', :'lee', :'missed_today', 2100, 'card', 'paid', now()) returning id as fee_payment \gset
select results_eq(
  format($$ select n ->> 'booking_status', (n ->> 'fee_pence')::int, (n ->> 'amount_pence')::int from (select public.system_payment_notice(%L) as n) as notice $$, :'fee_payment'),
  $$ values ('no_show', 2100, 2100) $$,
  'a fee paid says what became of the lesson and what the fee was, so it can be told as the fee'
);

-- ---------------------------------------------------------------------------------------
-- Owed for two days.
-- ---------------------------------------------------------------------------------------
select pg_temp.lesson(:'lee', now() - interval '3 days', 'completed', 'unpaid') as overdue_card \gset
select pg_temp.lesson(:'lee', now() - interval '26 hours', 'completed', 'unpaid') as not_yet \gset
select pg_temp.lesson(:'lee', now() - interval '40 days', 'completed', 'unpaid') as long_ago \gset
select pg_temp.lesson(:'lou', now() - interval '4 days', 'completed', 'unpaid', 'offline') as overdue_cash \gset
select pg_temp.lesson(:'lou', now() - interval '5 days', 'no_show', 'unpaid') as missed \gset
update public.bookings set fee_pence = 2100 where id = :'missed';
select pg_temp.lesson(:'lou', now() - interval '6 days', 'completed', 'paid_cash') as paid_long_ago \gset

select set_eq(
  $$ select * from pg_temp.overdue() $$,
  format($$ values (%L::uuid), (%L::uuid), (%L::uuid) $$, :'overdue_card', :'overdue_cash', :'missed'),
  'lessons and fees owed for two days are overdue: not one owed for a day, not one from last month, not one paid'
);

select results_eq(
  format($$ select (value ->> 'amount_pence')::int, (value ->> 'in_person')::boolean
              from jsonb_array_elements(public.system_overdue_lessons()) where (value ->> 'booking_id')::uuid in (%L, %L)
             order by (value ->> 'due_at')::timestamptz $$, :'missed', :'overdue_cash'),
  $$ values (2100, false), (4200, true) $$,
  'a fee is overdue for the fee, and a lesson paid in person says so, so its learner is not chased'
);

-- ---------------------------------------------------------------------------------------
-- Credit running low.
-- ---------------------------------------------------------------------------------------
create or replace function pg_temp.low_credit_events()
returns integer language sql as $$
  select count(*)::int from public.outbox_events
   where name = 'credit.low' and payload ->> 'learner_id' = 'c0000000-0000-0000-0000-000000000002';
$$;

select pg_temp.lesson(:'lou', now() + interval '2 days', 'confirmed', 'unpaid') as lou_lesson_1 \gset
insert into public.credit_ledger (business_id, learner_id, lot_id, kind, minutes, booking_id)
values (:'school', :'lou', :'lou_lot', 'use', -30, :'lou_lesson_1');
select is(pg_temp.low_credit_events(), 0, 'using credit that leaves more than 2 hours says nothing');

select pg_temp.lesson(:'lou', now() + interval '3 days', 'confirmed', 'unpaid') as lou_lesson_2 \gset
insert into public.credit_ledger (business_id, learner_id, lot_id, kind, minutes, booking_id)
values (:'school', :'lou', :'lou_lot', 'use', -60, :'lou_lesson_2');
select results_eq(
  $$ select count(*)::int, max((payload ->> 'balance_minutes')::int) from public.outbox_events
      where name = 'credit.low' and payload ->> 'learner_id' = 'c0000000-0000-0000-0000-000000000002' $$,
  $$ values (1, 90) $$,
  'using credit that leaves 2 hours or less asks for the learner and their instructor to be told'
);

select pg_temp.lesson(:'lou', now() + interval '4 days', 'confirmed', 'unpaid') as lou_lesson_3 \gset
insert into public.credit_ledger (business_id, learner_id, lot_id, kind, minutes, booking_id)
values (:'school', :'lou', :'lou_lot', 'use', -30, :'lou_lesson_3');
select is(pg_temp.low_credit_events(), 1, 'once: going lower still says nothing more');

insert into public.credit_ledger (business_id, learner_id, lot_id, kind, minutes, booking_id, actor_id, reason)
values (:'school', :'lou', :'lou_lot', 'adjustment', 60, null, :'ben', 'Goodwill');
insert into public.credit_ledger (business_id, learner_id, lot_id, kind, minutes, booking_id, actor_id, reason)
values (:'school', :'lou', :'lou_lot', 'adjustment', -60, null, :'ben', 'Taken back off');
select is(pg_temp.low_credit_events(), 1, 'credit taken off by hand is not credit running low');

select results_eq(
  format($$ select (n ->> 'balance_minutes')::int, (n ->> 'latest_lot_id')::uuid, n ->> 'instructor_name', n ->> 'business_name'
              from (select public.system_credit_notice(%L, %L) as n) as notice $$, :'school', :'lou'),
  format($$ values (60, %L::uuid, 'Ivy', 'Bee School') $$, :'lou_lot'),
  'low credit concerns the learner and their instructor, with what is left and the lot it is told about once for'
);

select tests.authenticate_as(:'ian_user');
select throws_ok(
  format($$ select public.system_payment_notice(%L) $$, :'lesson_payment'),
  '42501', null,
  'nobody signed in can ask who a payment concerns'
);
select tests.clear_authentication();

select * from finish();
rollback;
