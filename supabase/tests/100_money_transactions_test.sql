-- What the Money screen lists under the figures, and what is still owed back (MNY-01, R-08, D-195).
begin;
select plan(12);

select tests.create_fixture();

\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set ben 'b0000000-0000-0000-0000-000000000001'
\set mia 'b0000000-0000-0000-0000-000000000002'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set ivy 'b1000000-0000-0000-0000-000000000002'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set lesson_type 'b2000000-0000-0000-0000-000000000001'

create or replace function pg_temp.lesson(p_instructor uuid, p_days integer)
returns uuid language sql as $$
  insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                               buffer_minutes, status, payment_status, price_pence, source)
  values ('bbbb0000-0000-0000-0000-000000000000', p_instructor, 'c0000000-0000-0000-0000-000000000001',
          'b2000000-0000-0000-0000-000000000001', now() - (p_days || ' days')::interval,
          now() - (p_days || ' days')::interval + interval '1 hour', 0, 'completed', 'paid_card', 4200, 'instructor')
  returning id;
$$;

create or replace function pg_temp.paid(p_booking uuid, p_method text, p_amount integer, p_days integer)
returns uuid language sql as $$
  insert into public.payments (business_id, learner_id, booking_id, provider, amount_pence, method, status, paid_at)
  values ('bbbb0000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001', p_booking,
          case when p_method = 'card' then 'stripe' else 'offline' end, p_amount, p_method::public.payment_method,
          'paid', now() - (p_days || ' days')::interval)
  returning id;
$$;

-- Five lessons paid for, newest last: four of Ian's and one of Ivy's, and a package with no lesson.
select pg_temp.lesson(:'ian', 9) as l1 \gset
select pg_temp.paid(:'l1', 'card', 4200, 9) as p1 \gset
select pg_temp.lesson(:'ian', 8) as l2 \gset
select pg_temp.paid(:'l2', 'cash', 4200, 8);
select pg_temp.lesson(:'ian', 7) as l3 \gset
select pg_temp.paid(:'l3', 'bank', 4200, 7);
select pg_temp.lesson(:'ivy', 6) as l4 \gset
select pg_temp.paid(:'l4', 'card', 4400, 6);
select pg_temp.lesson(:'ian', 5) as l5 \gset
select pg_temp.paid(:'l5', 'card', 4200, 5);

insert into public.payments (business_id, learner_id, amount_pence, method, status, paid_at, provider)
values (:'school', :'lee', 38000, 'card', 'paid', now() - interval '4 days', 'stripe') returning id as package \gset
insert into public.credit_accounts (business_id, learner_id) values (:'school', :'lee') on conflict do nothing;
insert into public.credit_lots (business_id, learner_id, payment_id, minutes_total, price_pence, purchased_at)
values (:'school', :'lee', :'package', 600, 38000, now() - interval '4 days');

-- Money back: one card refund settled, and two cash refunds still to be handed over.
insert into public.refunds (business_id, payment_id, booking_id, learner_id, kind, amount_pence, reason, status, settled_at)
values (:'school', :'p1', :'l1', :'lee', 'card', 1000, 'Lesson cut short', 'succeeded', now() - interval '3 days');
insert into public.refunds (business_id, booking_id, learner_id, kind, provider, amount_pence, reason, status, created_at)
values (:'school', :'l2', :'lee', 'offline', 'offline', 4200, 'Called it off in time', 'pending', now() - interval '2 days');
insert into public.refunds (business_id, booking_id, learner_id, kind, provider, amount_pence, reason, status, created_at)
values (:'school', :'l4', :'lee', 'offline', 'offline', 4400, 'Instructor was ill', 'pending', now() - interval '1 day');

-- ---------------------------------------------------------------------------------------
-- The owner sees everything the Business took and gave back, five at a time.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ben');
select public.money_transactions(:'school', 5, 0) as page_one \gset
select public.money_transactions(:'school', 5, 5) as page_two \gset
select tests.clear_authentication();

select results_eq(
  format($$ select jsonb_array_length(t -> 'rows'), (t ->> 'more')::boolean from (select %L::jsonb as t) as x $$, :'page_one'),
  $$ values (5, true) $$,
  'a page is as long as it was asked for, and says there is another'
);
select results_eq(
  format($$ select r ->> 'kind', (r ->> 'amount_pence')::int
              from jsonb_array_elements(%L::jsonb -> 'rows') as r $$, :'page_one'),
  $$ values ('refund', 4400), ('refund', 4200), ('refund', 1000), ('payment', 38000), ('payment', 4200) $$,
  'newest first, with money going back listed beside money coming in'
);
select results_eq(
  format($$ select jsonb_array_length(t -> 'rows'), (t ->> 'more')::boolean from (select %L::jsonb as t) as x $$, :'page_two'),
  $$ values (4, false) $$,
  'and the last page says there is no more'
);
select is(
  (select r ->> 'learner_name' from jsonb_array_elements(:'page_one'::jsonb -> 'rows') as r limit 1),
  'Lee One',
  'each one says who it was'
);
select is(
  (select (r ->> 'credit_minutes')::int from jsonb_array_elements(:'page_one'::jsonb -> 'rows') as r
    where (r ->> 'amount_pence')::int = 38000),
  600,
  'a package says how many minutes it bought'
);
select is(
  (select r ->> 'status' from jsonb_array_elements(:'page_one'::jsonb -> 'rows') as r
    where (r ->> 'amount_pence')::int = 4400 and r ->> 'kind' = 'refund'),
  'pending',
  'and a refund not yet handed back says so'
);

-- ---------------------------------------------------------------------------------------
-- Everybody else sees their own share of it, or none.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ian_user');
select is(
  (select count(*)::int from jsonb_array_elements(public.money_transactions(:'school', 50, 0) -> 'rows')),
  6,
  'an instructor sees their own four lessons and both refunds on them, and neither the package nor Ivy'
);
select tests.authenticate_as(:'mia');
select is(public.money_transactions(:'school', 5, 0), null, 'a manager who may not see revenue sees no transactions at all (PRD 6.2)');
select tests.authenticate_as(:'asha_user');
select throws_ok(
  format($$ select public.money_transactions(%L, 5, 0) $$, :'school'),
  '42501', null, 'somebody from another Business cannot read them'
);
select tests.authenticate_as(:'ben');
select throws_ok(
  format($$ select public.money_transactions(%L, 500, 0) $$, :'school'),
  'P0001', 'VALIDATION_FAILED', 'and nobody asks for the lot in one go'
);

-- ---------------------------------------------------------------------------------------
-- What is still owed back.
-- ---------------------------------------------------------------------------------------
select results_eq(
  format($$ select (r ->> 'amount_pence')::int, r ->> 'learner_name'
              from jsonb_array_elements(public.pending_refunds(%L)) as r $$, :'school'),
  $$ values (4200, 'Lee One'), (4400, 'Lee One') $$,
  'the owner sees both cash refunds waiting, the longest owed first, and not the card one already sent (R-08)'
);
select tests.authenticate_as(:'ian_user');
select is(
  (select count(*)::int from jsonb_array_elements(public.pending_refunds(:'school'))),
  1,
  'an instructor sees only the one owed for their own lesson'
);
select tests.clear_authentication();

select * from finish();
rollback;
