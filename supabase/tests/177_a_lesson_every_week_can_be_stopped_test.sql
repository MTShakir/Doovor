-- A lesson booked every week until it is stopped can be stopped (BOK-05, D-380).
begin;
select plan(10);

select tests.create_fixture();

\set asha 'aaaa0000-0000-0000-0000-000000000000'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set asha_profile 'a1000000-0000-0000-0000-000000000001'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set standard 'a2000000-0000-0000-0000-000000000001'

-- Asha teaches every day, eight till eight, and sells an hour.
insert into public.working_hours (instructor_id, business_id, weekday, start_time, end_time)
select :'asha_profile', :'asha', day, '08:00', '20:00' from generate_series(1, 7) as day;
insert into public.lesson_prices (business_id, lesson_type_id, duration_minutes, price_pence)
values (:'asha', :'standard', 60, 4200);

-- Thursday next week, whatever day this runs, as the weekly lessons test does (D-070).
create temp table thursday as
select (date_trunc('week', (now() at time zone 'Europe/London')::date + 7)::date + 3) as day;
grant select on thursday to authenticated;

select tests.authenticate_as(:'asha_user');
create temp table eleven as
select * from public.book_weekly(
  :'asha_profile', :'lee', :'standard', ((select day from thursday) + time '11:00') at time zone 'Europe/London', 60, 1, true
);
create temp table three as
select * from public.book_weekly(
  :'asha_profile', :'lee', :'standard', ((select day from thursday) + time '15:00') at time zone 'Europe/London', 60, 1, true
);
create temp table slots as
select b.recurrence_id as id, to_char(b.starts_at at time zone 'Europe/London', 'HH24:MI') as at
  from public.bookings b
 where b.id in (select booking_id from eleven union all select booking_id from three);
grant select on slots to authenticated;

-- ---------------------------------------------------------------------------------------
-- Stopped by the instructor.
-- ---------------------------------------------------------------------------------------
-- The learner cannot: they ask their instructor (BOK-08 as amended, D-164).
select tests.authenticate_as(:'lee');
select throws_ok(
  format('select public.stop_recurrence(%L)', (select id from slots where at = '11:00')),
  '42501', null,
  'a learner cannot stop the weekly lesson they are booked into'
);

select tests.authenticate_as(:'asha_user');
select lives_ok(
  format('select public.stop_recurrence(%L)', (select id from slots where at = '11:00')),
  'the instructor stops it'
);
select isnt(
  (select cancelled_at from public.booking_recurrences where id = (select id from slots where at = '11:00')),
  null,
  'and it is stopped'
);
select is(
  (select count(*)::int from public.bookings where recurrence_id = (select id from slots where at = '11:00') and status = 'confirmed'),
  1,
  'the lesson already booked stays booked'
);

select tests.clear_authentication();
select public.system_extend_recurrences(4);
select is(
  (select count(*)::int from public.bookings where recurrence_id = (select id from slots where at = '11:00')),
  1,
  'and the sweep books no more of it'
);
select ok(
  (select count(*)::int from public.bookings where recurrence_id = (select id from slots where at = '15:00')) > 1,
  'while the one still going is booked further ahead'
);

-- ---------------------------------------------------------------------------------------
-- Stopped by the learner leaving.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'asha_user');
select public.set_learner_status(:'lee', 'left');
select isnt(
  (select cancelled_at from public.booking_recurrences where id = (select id from slots where at = '15:00')),
  null,
  'marking the learner as having left stops their weekly lesson'
);
-- The audit log is staff's to read, so it is read as the test runner.
select tests.clear_authentication();
select ok(
  exists (
    select 1 from public.audit_log
     where action = 'booking.repeat_stopped'
       and entity_id = (select id from slots where at = '15:00')
       and actor_user_id = :'asha_user'
  ),
  'written down as the instructor who marked them'
);

-- ---------------------------------------------------------------------------------------
-- A slot of somebody who had already gone, as one made before this was true would be.
-- ---------------------------------------------------------------------------------------
select tests.clear_authentication();
insert into public.booking_recurrences (id, business_id, instructor_id, learner_id, lesson_type_id, weekday,
                                        local_time, duration_minutes, starts_on, created_by)
values ('f0000000-0000-0000-0000-000000000180', :'asha', :'asha_profile', :'lee', :'standard', 4,
        '17:00', 60, (select day from thursday), :'asha_user');
select public.system_extend_recurrences(4);
select is_empty(
  $$ select 1 from public.bookings where recurrence_id = 'f0000000-0000-0000-0000-000000000180' $$,
  'the sweep books nothing for a learner who has left'
);
select isnt(
  (select cancelled_at from public.booking_recurrences where id = 'f0000000-0000-0000-0000-000000000180'),
  null,
  'and stops their slot'
);

select * from finish();
rollback;
