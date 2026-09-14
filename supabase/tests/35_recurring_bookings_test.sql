-- The weekly slot (BOK-05, R-13, R-14, M2-19).
--
-- Acceptance test 9 from PRD 17.2: the clocks go forward on the last Sunday in March, and a
-- weekly nine o'clock lesson is still at nine o'clock.
begin;
select plan(11);

select tests.create_fixture();

\set ian 'b1000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set lou 'c0000000-0000-0000-0000-000000000002'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set lesson_type 'b2000000-0000-0000-0000-000000000001'

insert into public.working_hours (instructor_id, business_id, weekday, start_time, end_time)
values (:'ian', :'school', 4, '08:00', '20:00');
insert into public.lesson_prices (business_id, lesson_type_id, duration_minutes, price_pence)
values (:'school', :'lesson_type', 60, 4200);
update public.instructor_profiles set buffer_minutes = 30 where id = :'ian';

select tests.authenticate_as(:'ian_user');

-- ---------------------------------------------------------------------------------------
-- Four Thursdays either side of the March clock change (26 March to 16 April 2026).
-- ---------------------------------------------------------------------------------------
create temp table weekly as
select * from public.book_weekly(
  :'ian', :'lee', :'lesson_type', (date '2026-03-26' + time '09:00') at time zone 'Europe/London', 60, 4
);

select is((select count(*)::int from weekly), 4, 'four weeks asked for, four weeks answered');
select is(
  (select count(*)::int from weekly where booking_id is not null),
  4,
  'and all four were booked'
);
select is(
  (select count(distinct to_char(starts_at at time zone 'Europe/London', 'HH24:MI'))::int from weekly),
  1,
  'acceptance-09: every one of them is at the same local time'
);
select is(
  (select to_char(min(starts_at) at time zone 'Europe/London', 'HH24:MI') from weekly),
  '09:00',
  'acceptance-09: which is nine o clock'
);
select is(
  (select count(distinct extract(epoch from starts_at)::bigint % 86400)::int from weekly),
  2,
  'acceptance-09: and the instant moves by an hour when the clocks do'
);
select is(
  (select count(*)::int from public.bookings b join weekly w on w.booking_id = b.id where b.recurrence_id is not null),
  4,
  'each lesson knows which weekly slot it belongs to'
);

-- ---------------------------------------------------------------------------------------
-- A week that clashes is reported, and the rest still go in (R-13).
-- ---------------------------------------------------------------------------------------
-- Written straight into the table, as a lesson somebody else made earlier would be.
select tests.clear_authentication();
insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                             buffer_minutes, status, price_pence, source)
values (:'school', :'ian', :'lou', :'lesson_type',
        (date '2026-05-07' + time '14:00') at time zone 'Europe/London',
        (date '2026-05-07' + time '15:00') at time zone 'Europe/London',
        30, 'confirmed', 4200, 'instructor');
select tests.authenticate_as(:'ian_user');

create temp table clashing as
select * from public.book_weekly(
  :'ian', :'lee', :'lesson_type', (date '2026-04-30' + time '14:00') at time zone 'Europe/London', 60, 3
);

select is((select count(*)::int from clashing where booking_id is not null), 2, 'the weeks that were free are booked');
select is(
  (select count(*)::int from clashing where problem is not null),
  1,
  'and the one that clashed is reported rather than refusing the lot'
);
select is(
  (select to_char(starts_at at time zone 'Europe/London', 'YYYY-MM-DD') from clashing where problem is not null),
  '2026-05-07',
  'by date, so the instructor knows which one to move'
);

-- ---------------------------------------------------------------------------------------
-- Open ended slots are kept booked by the sweep.
-- ---------------------------------------------------------------------------------------
-- The slot starts on Thursday next week, whatever day this runs (D-070): four to ten days
-- ahead, so the week after it is always inside the four weeks the sweep looks at.
create temp table ongoing as
select * from public.book_weekly(
  :'ian', :'lou', :'lesson_type',
  ((date_trunc('week', (now() at time zone 'Europe/London')::date + 7)::date + 3) + time '11:00')
    at time zone 'Europe/London',
  60, 1, true
);

select tests.clear_authentication();
select ok(
  (select public.system_extend_recurrences(4)) >= 1,
  'the sweep books an open ended slot further ahead'
);
select ok(
  (select booked_until from public.booking_recurrences where ends_on is null order by created_at desc limit 1)
    > (now() at time zone 'Europe/London')::date + 14,
  'and keeps it booked weeks ahead'
);

select * from finish();
rollback;
