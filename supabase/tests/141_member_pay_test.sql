-- What a school pays the instructors teaching under it, from a Monday on, and the week's
-- statement, which a later change never alters (M9-21, M9-22, D-291).
begin;
select plan(20);

select tests.create_fixture();

\set ben 'b0000000-0000-0000-0000-000000000001'
\set manager 'b0000000-0000-0000-0000-000000000002'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set ivy_user 'b0000000-0000-0000-0000-000000000004'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set ivy 'b1000000-0000-0000-0000-000000000002'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set type 'b2000000-0000-0000-0000-000000000001'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set liv 'c0000000-0000-0000-0000-000000000002'

select id as ian_member from public.memberships where business_id = :'school' and user_id = :'ian_user' \gset
select id as ivy_member from public.memberships where business_id = :'school' and user_id = :'ivy_user' \gset
-- Last week, Monday to Sunday.
select (date_trunc('week', private.today() - 7))::date::text as week \gset

select tests.authenticate_as(:'ben');
select lives_ok(
  format($$ select public.set_member_pay(%L, 'hourly', 1800, p_from => %L) $$, :'ian_member', :'week'),
  'the owner pays Ian £18 an hour from last week'
);
select lives_ok(
  format($$ select public.set_member_pay(%L, 'share', null, 60, %L) $$, :'ivy_member', :'week'),
  'and Ivy 60 per cent of each lesson'
);
select throws_ok(
  format($$ select public.set_member_pay(%L, 'hourly') $$, :'ian_member'),
  'VALIDATION_FAILED',
  'an hourly rate needs an amount'
);
select throws_ok(
  format($$ select public.set_member_pay(%L, 'share', null, 101) $$, :'ivy_member'),
  'VALIDATION_FAILED',
  'and a share is a share of the whole'
);
select throws_ok(
  format($$ select public.set_member_pay(%L, 'hourly', 1800, p_from => %L::date + 1) $$, :'ian_member', :'week'),
  'VALIDATION_FAILED',
  'pay changes on a Monday'
);
select throws_ok(
  format($$ select public.set_member_pay(%L, 'hourly', 1800, p_from => %L::date - 728) $$, :'ian_member', :'week'),
  'VALIDATION_FAILED',
  'and not two years back'
);

select tests.authenticate_as(:'manager');
select throws_ok(
  format($$ select public.set_member_pay(%L, 'hourly', 2500) $$, :'ian_member'),
  'NOT_ALLOWED',
  'a manager not allowed to see revenue does not set pay'
);
select is((select count(*)::int from public.member_pay), 0, 'nor reads it');
select tests.authenticate_as(:'ian_user');
select is(
  (select array_agg(basis || ' ' || coalesce(hourly_pence::text, share_percent::text)) from public.member_pay),
  array['hourly 1800'],
  'Ian reads his own pay, and nobody else''s'
);

-- Last week Ian taught an hour and an hour and a half, the second a no-show; one lesson was called
-- off. Ivy taught an hour.
reset role;
insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at, buffer_minutes, status, price_pence, source)
values
  (:'school', :'ian', :'lee', :'type', (:'week'::date + 1 + time '10:00') at time zone 'Europe/London', (:'week'::date + 1 + time '11:00') at time zone 'Europe/London', 30, 'completed', 4200, 'instructor'),
  (:'school', :'ian', :'lee', :'type', (:'week'::date + 3 + time '10:00') at time zone 'Europe/London', (:'week'::date + 3 + time '11:30') at time zone 'Europe/London', 30, 'no_show', 6000, 'instructor'),
  (:'school', :'ian', :'lee', :'type', (:'week'::date + 4 + time '10:00') at time zone 'Europe/London', (:'week'::date + 4 + time '11:00') at time zone 'Europe/London', 30, 'cancelled', 4200, 'instructor'),
  (:'school', :'ivy', :'liv', :'type', (:'week'::date + 2 + time '14:00') at time zone 'Europe/London', (:'week'::date + 2 + time '15:00') at time zone 'Europe/London', 30, 'completed', 4200, 'instructor');

create function pg_temp.totals(p_week date) returns text[] language sql as $$
  select array_agg((x ->> 'name') || ' ' || (x ->> 'minutes') || ' ' || (x ->> 'pricePence') || ' ' || coalesce(x ->> 'payPence', 'none') order by x ->> 'name')
    from jsonb_array_elements(public.member_pay_statement('bbbb0000-0000-0000-0000-000000000000', p_week) -> 'members') as x
$$;

select tests.authenticate_as(:'ben');
select is(
  pg_temp.totals(:'week'::date),
  array['Ian 150 10200 4500', 'Ivy 60 4200 2520'],
  'the week says what each taught, took and is paid: by the hour for Ian, a share for Ivy'
);
select is(
  (select array_agg((l ->> 'payPence') || ' ' || (l ->> 'learnerName') order by l ->> 'startsAt')
     from jsonb_array_elements(public.member_pay_statement(:'school', :'week'::date) -> 'members') as x,
          jsonb_array_elements(x -> 'lessons') as l
    where x ->> 'name' = 'Ian'),
  array['1800 Lee One', '2700 Lee One'],
  'each lesson with its pay and who it was with, and none called off'
);
select throws_ok(
  format($$ select public.member_pay_statement(%L, %L::date + 1) $$, :'school', :'week'),
  'VALIDATION_FAILED',
  'a week starts on a Monday'
);

-- From this week, Ian gets £20 and Ivy has no pay set; last week says what it said.
select public.set_member_pay(:'ian_member', 'hourly', 2000);
select public.set_member_pay(:'ivy_member');
select is(pg_temp.totals(:'week'::date), array['Ian 150 10200 4500', 'Ivy 60 4200 2520'], 'a week already done keeps its pay');
select is(
  (select array_agg(coalesce(x ->> 'nowBasis', 'none') || ' ' || coalesce(x ->> 'nowHourlyPence', '-') order by x ->> 'name')
     from jsonb_array_elements(public.member_pay_statement(:'school', :'week'::date) -> 'members') as x),
  array['hourly 2000', 'none -'],
  'and says what each is paid now'
);
select is(
  pg_temp.totals((:'week'::date + 7)),
  array['Ian 0 0 0', 'Ivy 0 0 none'],
  'this week, at the new rates'
);

select tests.authenticate_as(:'ian_user');
select is(
  (select array_agg(x ->> 'name') from jsonb_array_elements(public.member_pay_statement(:'school', :'week'::date, :'ian_user') -> 'members') as x),
  array['Ian'],
  'Ian reads his own week'
);
select throws_ok(
  format($$ select public.member_pay_statement(%L, %L::date) $$, :'school', :'week'),
  'NOT_ALLOWED',
  'and not everybody''s'
);
select throws_ok(
  format($$ select public.member_pay_statement(%L, %L::date, %L) $$, :'school', :'week', :'ivy_user'),
  'NOT_ALLOWED',
  'nor Ivy''s'
);

reset role;
select is((select count(*)::int from public.member_pay where membership_id = :'ivy_member'), 2, 'each change is kept, from its Monday on');
select is(
  (select count(*)::int from public.audit_log where action = 'school.member_pay_set' and business_id = :'school'),
  4,
  'and written down'
);

select * from finish();
rollback;
