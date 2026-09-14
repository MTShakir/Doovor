-- The money dashboard (MNY-01, M3-21).
begin;
select plan(10);

select tests.create_fixture();

\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set ben 'b0000000-0000-0000-0000-000000000001'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set ivy 'b1000000-0000-0000-0000-000000000002'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set lesson_type 'b2000000-0000-0000-0000-000000000001'

-- The 2026 to 2027 tax year, as packages/core/src/money-periods.ts turns it into instants.
\set year_from '2026-04-05T23:00:00Z'
\set year_to '2027-04-05T23:00:00Z'

create or replace function pg_temp.lesson(p_instructor uuid, p_starts timestamptz, p_status text, p_payment text, p_price integer)
returns uuid language sql as $$
  insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                               buffer_minutes, status, payment_status, price_pence, source)
  values ('bbbb0000-0000-0000-0000-000000000000', p_instructor, 'c0000000-0000-0000-0000-000000000001',
          'b2000000-0000-0000-0000-000000000001', p_starts, p_starts + interval '1 hour', 0,
          p_status::public.booking_status, p_payment::public.booking_payment_status, p_price, 'instructor')
  returning id;
$$;

create or replace function pg_temp.paid(p_booking uuid, p_method text, p_amount integer, p_at timestamptz)
returns uuid language sql as $$
  insert into public.payments (business_id, learner_id, booking_id, provider, amount_pence, method, status, paid_at)
  values ('bbbb0000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001', p_booking,
          case when p_method = 'card' then 'stripe' else 'offline' end, p_amount, p_method::public.payment_method, 'paid', p_at)
  returning id;
$$;

-- Ian's lessons: two paid, a card one on the last evening of the tax year and a cash one in the
-- first minutes of the next, in British Summer Time either side of midnight.
select pg_temp.lesson(:'ian', '2027-04-05T08:00:00Z', 'completed', 'paid_card', 4200) as ian_card \gset
select pg_temp.paid(:'ian_card', 'card', 4200, '2027-04-05T22:59:59Z') as ian_card_payment \gset
select pg_temp.lesson(:'ian', '2027-04-06T08:00:00Z', 'completed', 'paid_cash', 4000) as ian_cash \gset
select pg_temp.paid(:'ian_cash', 'cash', 4000, '2027-04-05T23:00:00Z');
-- Ivy's: paid by bank in the middle of the year, and one lesson not paid.
select pg_temp.lesson(:'ivy', '2026-09-10T08:00:00Z', 'completed', 'paid_bank', 4400) as ivy_bank \gset
select pg_temp.paid(:'ivy_bank', 'bank', 4400, '2026-09-10T10:00:00Z');
select pg_temp.lesson(:'ivy', '2026-09-11T08:00:00Z', 'completed', 'unpaid', 4400);
-- Ian's no-show with its fee owed, and a lesson still to come, which is not owed yet.
select pg_temp.lesson(:'ian', '2026-09-12T08:00:00Z', 'no_show', 'unpaid', 4200) as missed \gset
update public.bookings set fee_pence = 2100 where id = :'missed';
select pg_temp.lesson(:'ian', now() + interval '3 days', 'confirmed', 'unpaid', 4200);

-- A package, and a refund given back on Ian's card lesson.
insert into public.payments (business_id, learner_id, amount_pence, method, status, paid_at, provider)
values (:'school', :'lee', 38000, 'card', 'paid', '2026-10-01T10:00:00Z', 'stripe') returning id as package_payment \gset
insert into public.credit_accounts (business_id, learner_id) values (:'school', :'lee') on conflict do nothing;
insert into public.credit_lots (business_id, learner_id, payment_id, minutes_total, price_pence, purchased_at)
values (:'school', :'lee', :'package_payment', 600, 38000, '2026-10-01T10:00:00Z') returning id as lot \gset
insert into public.credit_ledger (business_id, learner_id, lot_id, kind, minutes, payment_id)
values (:'school', :'lee', :'lot', 'purchase', 600, :'package_payment');
insert into public.refunds (business_id, payment_id, booking_id, learner_id, kind, amount_pence, reason, status, settled_at)
values (:'school', :'ian_card_payment', :'ian_card', :'lee', 'card', 1000, 'Lesson cut short', 'succeeded', '2027-01-10T10:00:00Z');

-- ---------------------------------------------------------------------------------------
-- The owner sees the whole Business.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ben');
select public.money_summary(:'school', :'year_from', :'year_to') as owner_year \gset
select tests.clear_authentication();

select results_eq(
  format($$ select (s -> 'paid' ->> 'total_pence')::int, (s -> 'paid' ->> 'card_pence')::int, (s -> 'paid' ->> 'bank_pence')::int,
                   (s -> 'paid' ->> 'cash_pence')::int, (s -> 'paid' ->> 'count')::int
              from (select %L::jsonb as s) as summary $$, :'owner_year'),
  $$ values (8600, 4200, 4400, 0, 2) $$,
  'the tax year counts money paid on the evening of 5 April, and leaves out cash paid in the first minute of 6 April (MNY-01)'
);

select results_eq(
  format($$ select (s -> 'credit_sold' ->> 'total_pence')::int, (s -> 'credit_sold' ->> 'minutes')::int,
                   (s -> 'refunds' ->> 'total_pence')::int, (s -> 'unpaid' ->> 'total_pence')::int, (s -> 'unpaid' ->> 'count')::int,
                   (s ->> 'whole_business')::boolean
              from (select %L::jsonb as s) as summary $$, :'owner_year'),
  $$ values (38000, 600, 1000, 6500, 2, true) $$,
  'credit sold, refunds, and what is owed: a lesson not paid and a no-show fee, but not a lesson still to come'
);

select tests.authenticate_as(:'ben');
select is(
  (public.money_summary(:'school', '2027-04-05T23:00:00Z', '2028-04-05T23:00:00Z') -> 'paid' ->> 'cash_pence')::int,
  4000,
  'the cash paid at 00:00 on 6 April is in the next tax year'
);

-- ---------------------------------------------------------------------------------------
-- An instructor at the school sees their own lessons.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ian_user');
select public.money_summary(:'school', :'year_from', :'year_to') as ian_year \gset
select tests.clear_authentication();

select results_eq(
  format($$ select (s -> 'paid' ->> 'total_pence')::int, (s -> 'refunds' ->> 'total_pence')::int, (s -> 'unpaid' ->> 'total_pence')::int,
                   s -> 'credit_sold', (s ->> 'whole_business')::boolean
              from (select %L::jsonb as s) as summary $$, :'ian_year'),
  $$ values (4200, 1000, 2100, 'null'::jsonb, false) $$,
  'a school instructor sees what their own lessons took, gave back and are owed, and no credit sold'
);

-- ---------------------------------------------------------------------------------------
-- Nobody else, and nothing silly.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'asha_user');
select throws_ok(
  format($$ select public.money_summary(%L, %L, %L) $$, :'school', :'year_from', :'year_to'),
  '42501', null,
  'somebody from another Business cannot read it'
);
select tests.authenticate_as(:'lee');
select throws_ok(
  format($$ select public.money_summary(%L, %L, %L) $$, :'school', :'year_from', :'year_to'),
  '42501', null,
  'nor can a learner'
);
select tests.authenticate_as(:'ben');
select throws_ok(
  format($$ select public.money_summary(%L, %L, %L) $$, :'school', :'year_to', :'year_from'),
  'P0001', 'VALIDATION_FAILED',
  'a period that ends before it starts is refused'
);
select throws_ok(
  format($$ select public.money_summary(%L, '2020-01-01T00:00:00Z', %L) $$, :'school', :'year_to'),
  'P0001', 'VALIDATION_FAILED',
  'and so is one longer than a tax year and a bit'
);
select tests.clear_authentication();
select throws_ok(
  format($$ select public.money_summary(%L, %L, %L) $$, :'school', :'year_from', :'year_to'),
  '42501', null,
  'and nobody signed out'
);

select tests.authenticate_as(:'ben');
select is(
  (public.money_summary(:'school', '2026-09-07T23:00:00Z', '2026-09-14T23:00:00Z') -> 'paid' ->> 'bank_pence')::int,
  4400,
  'a week counts only its own days'
);

select * from finish();
rollback;
