-- The school overview (SCH-01, M5-12).
begin;
select plan(15);

select tests.create_fixture();

\set school 'bbbb0000-0000-0000-0000-000000000000'
\set asha_biz 'aaaa0000-0000-0000-0000-000000000000'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set ben 'b0000000-0000-0000-0000-000000000001'
\set mia 'b0000000-0000-0000-0000-000000000002'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set ivy 'b1000000-0000-0000-0000-000000000002'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set lou 'c0000000-0000-0000-0000-000000000002'
\set liz 'c0000000-0000-0000-0000-000000000003'
\set outsider 'd0000000-0000-0000-0000-000000000001'

-- Wednesday 28 October 2026 at noon, three days after the clocks went back. Its week runs from
-- Monday 26 October to midnight on Sunday 1 November, and its month from 00:00 on 1 October,
-- which was 23:00 on 30 September in UTC, to 00:00 on 1 November.
\set now '2026-10-28T12:00:00Z'

create or replace function pg_temp.lesson(
  p_instructor uuid, p_learner uuid, p_starts timestamptz, p_minutes integer, p_status text, p_payment text, p_price integer
)
returns uuid language sql as $$
  insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                               buffer_minutes, status, payment_status, price_pence, source)
  values ('bbbb0000-0000-0000-0000-000000000000', p_instructor, p_learner, 'b2000000-0000-0000-0000-000000000001',
          p_starts, p_starts + make_interval(mins => p_minutes), 0,
          p_status::public.booking_status, p_payment::public.booking_payment_status, p_price, 'instructor')
  returning id;
$$;

-- Learners: Lee joined the school on 5 October, Lou in September, and Liz at 23:30 on 31 October.
update public.learner_relationships set created_at = '2026-10-05T09:00:00Z' where business_id = :'school' and learner_id = :'lee';
update public.learner_relationships set created_at = '2026-09-20T09:00:00Z' where business_id = :'school' and learner_id = :'lou';
insert into public.learner_relationships (business_id, learner_id, instructor_id, created_at)
values (:'school', :'liz', :'ivy', '2026-10-31T23:30:00Z');

-- Ian works Monday to Friday, nine to five, and takes Friday off: 32 hours open.
insert into public.working_hours (instructor_id, business_id, weekday, start_time, end_time)
select :'ian', :'school', day, '09:00', '17:00' from generate_series(1, 5) as day;
insert into public.availability_exceptions (instructor_id, business_id, kind, starts_at, ends_at, reason)
values (:'ian', :'school', 'blocked', '2026-10-30T00:00:00Z', '2026-10-31T00:00:00Z', 'Day off');
-- Ivy works Tuesday and Thursday, ten to two, and opens three extra hours on Saturday: 11 hours.
insert into public.working_hours (instructor_id, business_id, weekday, start_time, end_time)
values (:'ivy', :'school', 2, '10:00', '14:00'), (:'ivy', :'school', 4, '10:00', '14:00');
insert into public.availability_exceptions (instructor_id, business_id, kind, starts_at, ends_at, reason)
values (:'ivy', :'school', 'open', '2026-10-31T09:00:00Z', '2026-10-31T12:00:00Z', 'Extra Saturday');

-- Today: a lesson done and paid, and one this afternoon.
select pg_temp.lesson(:'ian', :'lee', '2026-10-28T09:00:00Z', 60, 'completed', 'paid_card', 4200) as paid_today \gset
select pg_temp.lesson(:'ian', :'lee', '2026-10-28T15:00:00Z', 90, 'confirmed', 'unpaid', 6300);
-- Earlier this week: a lesson called off in time, which does not count, and one nobody came to, with its fee owed.
select pg_temp.lesson(:'ian', :'lee', '2026-10-27T10:00:00Z', 60, 'cancelled', 'unpaid', 4200);
select pg_temp.lesson(:'ian', :'lee', '2026-10-26T10:00:00Z', 120, 'no_show', 'unpaid', 8400) as missed \gset
update public.bookings set fee_pence = 4200 where id = :'missed';
-- Later this week: Ivy on Thursday, and Ian late on Sunday evening, half of it in next week.
select pg_temp.lesson(:'ivy', :'lou', '2026-10-29T10:00:00Z', 60, 'confirmed', 'unpaid', 4400);
select pg_temp.lesson(:'ian', :'lee', '2026-11-01T23:30:00Z', 60, 'confirmed', 'unpaid', 4200);
-- Not this week: Ivy on the Sunday before, done and not paid, and next Monday.
select pg_temp.lesson(:'ivy', :'lou', '2026-10-25T10:00:00Z', 60, 'completed', 'unpaid', 4400);
select pg_temp.lesson(:'ivy', :'lou', '2026-11-02T10:00:00Z', 60, 'confirmed', 'unpaid', 4400);
-- Long ago, still not paid; and one paid from a package, which is not owed.
select pg_temp.lesson(:'ivy', :'liz', '2026-08-03T10:00:00Z', 60, 'completed', 'unpaid', 4000);
select pg_temp.lesson(:'ivy', :'liz', '2026-10-06T10:00:00Z', 60, 'completed', 'paid_credit', 4400) as from_credit \gset
update public.bookings set payment_mode = 'credit' where id = :'from_credit';
-- Another Business's lesson today counts for that Business only.
insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at, buffer_minutes, status, payment_status, price_pence, source)
values (:'asha_biz', 'a1000000-0000-0000-0000-000000000001', :'lee', 'a2000000-0000-0000-0000-000000000001',
        '2026-10-28T13:00:00Z', '2026-10-28T14:00:00Z', 0, 'confirmed', 'unpaid', 4000, 'instructor');

-- Money this month: the card payment today; cash paid at 00:30 on 1 October, which is still
-- 30 September in UTC; a package on the 15th; and a card refund. Not this month: a bank payment
-- at 23:30 on 30 September, a payment at midnight on 1 November, credit given back as credit, and
-- a refund still on its way.
insert into public.payments (business_id, learner_id, booking_id, provider, amount_pence, method, status, paid_at) values
  (:'school', :'lee', :'paid_today', 'stripe', 4200, 'card', 'paid', '2026-10-28T10:00:00Z'),
  (:'school', :'lou', null, 'offline', 3000, 'cash', 'paid', '2026-09-30T23:30:00Z'),
  (:'school', :'lou', null, 'offline', 5000, 'bank', 'paid', '2026-09-30T22:30:00Z'),
  (:'school', :'lou', null, 'offline', 2500, 'cash', 'paid', '2026-11-01T00:00:00Z');
insert into public.payments (business_id, learner_id, amount_pence, method, status, paid_at, provider)
values (:'school', :'liz', 38000, 'card', 'paid', '2026-10-15T10:00:00Z', 'stripe') returning id as package_payment \gset
insert into public.credit_accounts (business_id, learner_id) values (:'school', :'liz') on conflict do nothing;
insert into public.credit_lots (business_id, learner_id, payment_id, minutes_total, price_pence, purchased_at)
values (:'school', :'liz', :'package_payment', 600, 38000, '2026-10-15T10:00:00Z') returning id as lot \gset
insert into public.credit_ledger (business_id, learner_id, lot_id, kind, minutes, payment_id)
values (:'school', :'liz', :'lot', 'purchase', 600, :'package_payment');
select id as card_payment from public.payments where booking_id = :'paid_today' \gset
insert into public.refunds (business_id, payment_id, booking_id, learner_id, kind, amount_pence, reason, status, settled_at) values
  (:'school', :'card_payment', :'paid_today', :'lee', 'card', 1000, 'Lesson cut short', 'succeeded', '2026-10-20T10:00:00Z'),
  (:'school', :'card_payment', :'paid_today', :'lee', 'card', 500, 'Still on its way', 'pending', null),
  (:'school', null, :'paid_today', :'lee', 'credit', 700, 'Given back as credit', 'succeeded', '2026-10-21T10:00:00Z');

-- ---------------------------------------------------------------------------------------
-- The figures, at noon on Wednesday 28 October.
-- ---------------------------------------------------------------------------------------
select private.school_overview_facts(:'school', :'now') as facts \gset

select results_eq(
  format($$ select (f -> 'lessons' ->> 'today')::int, (f -> 'lessons' ->> 'this_week')::int from (select %L::jsonb as f) as x $$, :'facts'),
  $$ values (2, 5) $$,
  'lessons today and this week count those on, done or missed, including a Sunday late evening, and not one called off (SCH-01)'
);

select results_eq(
  format($$ select (f -> 'revenue_month' ->> 'lessons_pence')::int, (f -> 'revenue_month' ->> 'packages_pence')::int,
                   (f -> 'revenue_month' ->> 'refunds_pence')::int, (f -> 'revenue_month' ->> 'total_pence')::int
              from (select %L::jsonb as f) as x $$, :'facts'),
  $$ values (7200, 38000, 1000, 44200) $$,
  'revenue this month is money taken in London''s October for lessons and packages, less what went back'
);

select results_eq(
  format($$ select (f -> 'unpaid' ->> 'total_pence')::int, (f -> 'unpaid' ->> 'count')::int from (select %L::jsonb as f) as x $$, :'facts'),
  $$ values (12600, 3) $$,
  'unpaid is everything owed now, however long ago: a missed lesson''s fee and two lessons, and nothing still to come or paid from a package'
);

select results_eq(
  format($$ select (f -> 'utilisation' ->> 'open_minutes')::int, (f -> 'utilisation' ->> 'booked_minutes')::int from (select %L::jsonb as f) as x $$, :'facts'),
  $$ values (2580, 360) $$,
  'across the school, 43 hours are open this week and 6 are booked'
);

select results_eq(
  format($$ select i ->> 'name', (i ->> 'open_minutes')::int, (i ->> 'booked_minutes')::int
              from jsonb_array_elements((select %L::jsonb) -> 'utilisation' -> 'instructors') as i $$, :'facts'),
  $$ values ('Ian'::text, 1920, 300), ('Ivy'::text, 660, 60) $$,
  'Ian has 32 hours open with his day off taken out, and the lessons he teaches, the half hour after midnight on Sunday left to next week; Ivy has 11 with her extra Saturday'
);

select is(
  ((:'facts')::jsonb ->> 'new_learners_month')::int,
  2,
  'two learners joined in October, the second half an hour before it ended'
);

select results_eq(
  format($$ select (f -> 'lessons' ->> 'today')::int, (f -> 'lessons' ->> 'this_week')::int
              from (select private.school_overview_facts(%L, '2026-10-25T23:30:00Z') as f) as x $$, :'school'),
  $$ values (1, 1) $$,
  'on the 25 hour Sunday the clocks go back, half past eleven at night is still that Sunday, and its week the week before'
);

-- ---------------------------------------------------------------------------------------
-- Who may see it.
-- ---------------------------------------------------------------------------------------
select private.school_overview_facts(:'school', now()) as facts_now \gset

select tests.authenticate_as(:'ben');
select is(public.school_overview(:'school'), (:'facts_now')::jsonb, 'the owner sees every figure, worked out now');

select tests.authenticate_as(:'mia');
select results_eq(
  format($$ select o -> 'revenue_month' = 'null'::jsonb, (o -> 'lessons') is not null from (select public.school_overview(%L) as o) as x $$, :'school'),
  $$ values (true, true) $$,
  'a manager sees the school''s figures but not its revenue'
);
select tests.clear_authentication();
update public.memberships set permissions = '{"view_revenue": true}' where business_id = :'school' and user_id = :'mia';
select tests.authenticate_as(:'mia');
select is(
  public.school_overview(:'school') -> 'revenue_month',
  (:'facts_now')::jsonb -> 'revenue_month',
  'until the owner allows it (PRD 6.2)'
);

select tests.authenticate_as(:'ian_user');
select throws_ok(format($$ select public.school_overview(%L) $$, :'school'), '42501', null, 'an instructor at the school does not see the overview');
select tests.authenticate_as(:'outsider');
select throws_ok(format($$ select public.school_overview(%L) $$, :'school'), '42501', null, 'nor does anybody from outside it');
select tests.authenticate_as(:'asha_user');
select throws_ok(format($$ select public.school_overview(%L) $$, :'asha_biz'), '42501', null, 'and a Business of one has no school overview');
select throws_ok(
  format($$ select private.school_overview_facts(%L, now()) $$, :'school'),
  '42501', null, 'the figures themselves are not open to anybody signed in'
);
select tests.authenticate_as_anon();
select throws_ok(format($$ select public.school_overview(%L) $$, :'school'), '42501', null, 'or to anybody signed out');

select * from finish();
rollback;
