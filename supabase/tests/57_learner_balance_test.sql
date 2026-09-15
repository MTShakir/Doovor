-- A learner's balance with a Business, the same for everybody who may see it, and a package paid
-- for in person (PAY-04, PAY-05, PAY-06, LRN-02, M3-16).
begin;
select plan(17);

select tests.create_fixture();

\set school 'bbbb0000-0000-0000-0000-000000000000'
\set ben 'b0000000-0000-0000-0000-000000000001'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set ivy 'b1000000-0000-0000-0000-000000000002'
\set ivy_user 'b0000000-0000-0000-0000-000000000004'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set lou 'c0000000-0000-0000-0000-000000000002'
\set liz 'c0000000-0000-0000-0000-000000000003'
\set otto 'd0000000-0000-0000-0000-000000000001'
\set lesson_type 'b2000000-0000-0000-0000-000000000001'

create or replace function pg_temp.lesson(p_instructor uuid, p_hours integer, p_status text, p_payment text default 'unpaid')
returns uuid language sql as $$
  insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                               buffer_minutes, status, payment_status, payment_mode, price_pence, source)
  values ('bbbb0000-0000-0000-0000-000000000000', p_instructor, 'c0000000-0000-0000-0000-000000000001',
          'b2000000-0000-0000-0000-000000000001',
          now() + make_interval(hours => p_hours), now() + make_interval(hours => p_hours + 1), 30,
          p_status::public.booking_status, p_payment::public.booking_payment_status, 'offline', 4200, 'instructor')
  returning id;
$$;

-- Lee owes Ian for last week and Ivy for three days ago, has paid Ian in cash for another, has a
-- lesson to come, and two hours of credit, half an hour of which went on a lesson.
select pg_temp.lesson(:'ian', -170, 'completed') as owed_ian \gset
select pg_temp.lesson(:'ivy', -72, 'completed') as owed_ivy \gset
select pg_temp.lesson(:'ian', -30, 'completed', 'paid_cash') as paid_lesson \gset
select pg_temp.lesson(:'ian', 50, 'confirmed') as coming \gset

insert into public.payments (business_id, learner_id, payer_id, booking_id, provider, amount_pence, method, status, paid_at)
values (:'school', :'lee', :'lee', :'paid_lesson', 'offline', 4200, 'cash', 'paid', now() - interval '29 hours');
insert into public.payments (business_id, learner_id, amount_pence, method, status, paid_at)
values (:'school', :'lee', 8400, 'card', 'paid', now() - interval '10 days')
returning id as package_payment \gset
select private.add_credit_lot(:'school', :'lee', 120, 8400, :'package_payment', null, null, null, null) as lot \gset
insert into public.credit_ledger (business_id, learner_id, lot_id, kind, minutes, booking_id)
values (:'school', :'lee', :'lot', 'use', -30, :'coming');

-- ---------------------------------------------------------------------------------------
-- The facts, for the learner.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'lee');
select public.learner_balance(:'school', :'lee') as lee_view \gset

select results_eq(
  format($$ select (%1$L::jsonb ->> 'credit_minutes')::int,
                   jsonb_array_length(%1$L::jsonb -> 'lessons'),
                   jsonb_array_length(%1$L::jsonb -> 'payments'),
                   jsonb_array_length(%1$L::jsonb -> 'credit') $$, :'lee_view'),
  $$ values (90, 3, 2, 1) $$,
  'a learner sees their credit, every lesson that could be owed for, their payments and what happened to their credit (PAY-06)'
);

select results_eq(
  format($$ select value ->> 'id' from jsonb_array_elements(%L::jsonb -> 'lessons') $$, :'lee_view'),
  format($$ values (%L), (%L), (%L) $$, :'owed_ian', :'owed_ivy', :'coming'),
  'the lessons are the unpaid ones that are on or have happened, in order, whoever taught them'
);

select results_eq(
  format($$ select value ->> 'credit_minutes', value ->> 'lesson_at' is null
              from jsonb_array_elements(%L::jsonb -> 'payments') order by value ->> 'at' $$, :'lee_view'),
  $$ values ('120', true), (null, false) $$,
  'a payment says whether it bought credit or paid for a lesson'
);

select is(
  (select value ->> 'move' from jsonb_array_elements(:'lee_view'::jsonb -> 'credit')),
  'use',
  'and the credit history leaves out buying it, which is already a payment'
);

-- ---------------------------------------------------------------------------------------
-- The same facts for everybody who may see them (M3-16).
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ian_user');
select is(
  public.learner_balance(:'school', :'lee'),
  :'lee_view'::jsonb,
  'the instructor who teaches the learner sees exactly what the learner sees, a lesson owed to a colleague included'
);

select tests.authenticate_as(:'ben');
select is(
  public.learner_balance(:'school', :'lee'),
  :'lee_view'::jsonb,
  'and so does the owner of the school'
);

select tests.authenticate_as(:'ivy_user');
select throws_ok(
  format($$ select public.learner_balance(%L, %L) $$, :'school', :'lee'),
  '42501', null,
  'an instructor who does not teach the learner does not see it'
);

select tests.authenticate_as(:'lou');
select throws_ok(
  format($$ select public.learner_balance(%L, %L) $$, :'school', :'lee'),
  '42501', null,
  'nor does another learner'
);
select is(
  (public.learner_balance(:'school', :'lou') ->> 'credit_minutes')::int,
  0,
  'who can see their own'
);

select tests.authenticate_as(:'otto');
select throws_ok(
  format($$ select public.learner_balance(%L, %L) $$, :'school', :'lee'),
  '42501', null,
  'and somebody with no part in it sees nothing'
);

-- ---------------------------------------------------------------------------------------
-- A package paid for in person (PAY-04, PAY-05).
-- ---------------------------------------------------------------------------------------
select tests.clear_authentication();
insert into public.packages (business_id, name, minutes, price_pence, expiry_days)
values (:'school', '10 hours', 600, 38000, 365)
returning id as ten_hours \gset
insert into public.packages (business_id, name, minutes, price_pence, is_active)
values (:'school', 'Old block', 300, 15000, false)
returning id as retired \gset

select tests.authenticate_as(:'ian_user');
select public.record_offline_package(:'lee', :'ten_hours', 'cash') as sold_lot \gset
select tests.clear_authentication();

select results_eq(
  format($$ select l.minutes_total, l.minutes_remaining, l.package_id, l.created_by, p.method::text, p.provider, p.amount_pence,
                   l.early_start_requested_at is null
              from public.credit_lots l join public.payments p on p.id = l.payment_id
             where l.id = %L $$, :'sold_lot'),
  format($$ values (600, 600, %L::uuid, %L::uuid, 'cash', 'offline', 38000, true) $$, :'ten_hours', :'ian_user'),
  'the instructor records ten hours paid for in cash: the payment, and the credit it buys'
);

select tests.authenticate_as(:'lee');
select is(
  (public.learner_balance(:'school', :'lee') ->> 'credit_minutes')::int,
  690,
  'and the learner has it to book with straight away'
);

select tests.authenticate_as(:'ivy_user');
select throws_ok(
  format($$ select public.record_offline_package(%L, %L, 'cash') $$, :'lee', :'ten_hours'),
  '42501', null,
  'an instructor who does not teach the learner cannot sell them credit'
);

select tests.authenticate_as(:'lee');
select throws_ok(
  format($$ select public.record_offline_package(%L, %L, 'cash') $$, :'lee', :'ten_hours'),
  '42501', null,
  'and a learner cannot give themselves any'
);

select tests.authenticate_as(:'ben');
select throws_ok(
  format($$ select public.record_offline_package(%L, %L, 'bank') $$, :'lee', :'retired'),
  'P0001', 'VALIDATION_FAILED',
  'a package no longer sold cannot be sold'
);
select throws_ok(
  format($$ select public.record_offline_package(%L, %L, 'cheque') $$, :'lee', :'ten_hours'),
  'P0001', 'VALIDATION_FAILED',
  'nor paid for any way but cash or a bank transfer'
);
select throws_ok(
  format($$ select public.record_offline_package(%L, %L, 'cash') $$, :'liz', :'ten_hours'),
  '42501', null,
  'nor sold to somebody who does not learn with the school (PAY-12)'
);

select * from finish();
rollback;
