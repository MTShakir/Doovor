-- An instructor's week at a glance (MNY-01, DIA-04, D-177).
begin;
select plan(9);

select tests.create_fixture();

\set school 'bbbb0000-0000-0000-0000-000000000000'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set ivy_user 'b0000000-0000-0000-0000-000000000004'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set ivy 'b1000000-0000-0000-0000-000000000002'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set lou 'c0000000-0000-0000-0000-000000000002'
\set liz 'c0000000-0000-0000-0000-000000000003'
\set lesson_type 'b2000000-0000-0000-0000-000000000001'
\set from_at '2021-03-01T00:00:00Z'
\set to_at '2021-03-08T00:00:00Z'

-- Ian's week: two lessons paid by card and cash on the Monday, one by credit on the Wednesday,
-- one still unpaid, a lesson called off, and one the week after. Ivy teaches somebody else.
insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at, buffer_minutes, status, payment_status, price_pence, source) values
  (:'school', :'ian', :'lee', :'lesson_type', '2021-03-01T10:00:00Z', '2021-03-01T11:00:00Z', 0, 'completed', 'paid_card', 4200, 'instructor'),
  (:'school', :'ian', :'lou', :'lesson_type', '2021-03-01T12:00:00Z', '2021-03-01T13:30:00Z', 0, 'completed', 'paid_cash', 6300, 'instructor'),
  (:'school', :'ian', :'lee', :'lesson_type', '2021-03-03T10:00:00Z', '2021-03-03T11:00:00Z', 0, 'completed', 'paid_credit', 4200, 'instructor'),
  (:'school', :'ian', :'liz', :'lesson_type', '2021-03-04T10:00:00Z', '2021-03-04T11:00:00Z', 0, 'confirmed', 'unpaid', 4200, 'instructor'),
  (:'school', :'ian', :'liz', :'lesson_type', '2021-03-05T10:00:00Z', '2021-03-05T11:00:00Z', 0, 'cancelled', 'unpaid', 4200, 'instructor'),
  (:'school', :'ian', :'lee', :'lesson_type', '2021-03-09T10:00:00Z', '2021-03-09T11:00:00Z', 0, 'confirmed', 'paid_card', 4200, 'instructor'),
  (:'school', :'ivy', :'lou', :'lesson_type', '2021-03-02T10:00:00Z', '2021-03-02T11:00:00Z', 0, 'completed', 'paid_card', 4200, 'instructor');

select tests.authenticate_as(:'ian_user');
select public.instructor_dashboard(:'from_at', :'to_at') as week \gset

select is(
  (select (f ->> 'earned_pence')::bigint from (select (:'week')::jsonb as f) x),
  14700::bigint,
  'what was earned counts every lesson paid for, by card, cash, bank or credit'
);
select is(
  (select (f ->> 'minutes')::int from (select (:'week')::jsonb as f) x),
  270,
  'the hours count every lesson that is on, paid for or not, and not one called off'
);
select is(
  (select (f ->> 'learners')::int from (select (:'week')::jsonb as f) x),
  3,
  'and each learner is counted once, however many lessons they had'
);
select is(
  (select jsonb_array_length(f -> 'days') from (select (:'week')::jsonb as f) x),
  7,
  'every day of the week is drawn, so an empty day is a gap rather than missing'
);
select results_eq(
  format($$ select (d ->> 'card_pence')::int, (d ->> 'cash_pence')::int, (d ->> 'credit_pence')::int
              from jsonb_array_elements(%L::jsonb -> 'days') as d
             where d ->> 'day' = '2021-03-01' $$, :'week'),
  $$ values (4200, 6300, 0) $$,
  'a day holds what was earned on it, split by how it was paid'
);
select results_eq(
  format($$ select (d ->> 'credit_pence')::int from jsonb_array_elements(%L::jsonb -> 'days') as d where d ->> 'day' = '2021-03-03' $$, :'week'),
  $$ values (4200) $$,
  'a lesson paid from credit is earned on the day it was taught'
);
select results_eq(
  format($$ select (d ->> 'card_pence')::int + (d ->> 'cash_pence')::int from jsonb_array_elements(%L::jsonb -> 'days') as d where d ->> 'day' = '2021-03-02' $$, :'week'),
  $$ values (0) $$,
  'another instructor''s lesson is not theirs'
);

-- ---------------------------------------------------------------------------------------
-- Who may ask, and for what.
-- ---------------------------------------------------------------------------------------
select throws_ok(
  format($$ select public.instructor_dashboard(%L, %L) $$, :'to_at', :'from_at'),
  'P0001', 'VALIDATION_FAILED', 'a range that runs backwards is no range'
);
select tests.authenticate_as(:'lee');
select throws_ok(
  format($$ select public.instructor_dashboard(%L, %L) $$, :'from_at', :'to_at'),
  '42501', 'NOT_ALLOWED', 'somebody who teaches nobody has no dashboard'
);

select * from finish();
rollback;
