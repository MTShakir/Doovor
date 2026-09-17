-- Cover lessons (DIA-03, BOK-01, D-097).
--
-- A school books a lesson for one instructor's learner with another instructor. The learner stays
-- with their own instructor (LRN-06); the instructor on the lesson reads who it is with, and
-- nothing else about them (CLAUDE.md rule 5). Who may put a learner into a diary is settled
-- before any lesson or weekly plan is written.
begin;
select plan(28);

select tests.create_fixture();

\set ian 'b1000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set ivy 'b1000000-0000-0000-0000-000000000002'
\set ivy_user 'b0000000-0000-0000-0000-000000000004'
\set manager_user 'b0000000-0000-0000-0000-000000000002'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set lou 'c0000000-0000-0000-0000-000000000002'
\set liz 'c0000000-0000-0000-0000-000000000003'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set lesson_type 'b2000000-0000-0000-0000-000000000001'

-- Both school instructors open every day, and a price to book against.
insert into public.working_hours (instructor_id, business_id, weekday, start_time, end_time)
select profile, :'school', weekday, '07:00', '21:00'
  from unnest(array[:'ian', :'ivy']::uuid[]) as profile, generate_series(1, 7) as weekday;
insert into public.lesson_prices (business_id, lesson_type_id, duration_minutes, price_pence)
values (:'school', :'lesson_type', 60, 4200);

-- What Ivy's side of the school knows about Lou, none of which a cover lesson hands to Ian.
insert into public.learner_notes (business_id, learner_id, author_id, body)
values (:'school', :'lou', :'ivy_user', 'Nervous on dual carriageways');
insert into public.pickup_points (learner_id, kind, label, address)
values (:'lou', 'home', 'Home', '4 Mill Lane');

-- Local times some days from whenever the test runs (D-070).
create or replace function pg_temp.at_local(p_days integer, p_time text)
returns timestamptz language sql stable as $$
  select (((now() at time zone 'Europe/London')::date + p_days) + p_time::time) at time zone 'Europe/London';
$$;

-- ---------------------------------------------------------------------------------------
-- Lou is Ivy's learner. Ian has no lesson with her, so she is not his to see or to book.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ian_user');

select is_empty(
  format($$ select id from public.users where id = %L $$, :'lou'),
  'an instructor cannot see a learner of the school they have no lesson with'
);
select throws_ok(
  format($$ select public.create_booking(%L, %L, %L, pg_temp.at_local(3, '10:00'), 60) $$, :'ian', :'lou', :'lesson_type'),
  '42501', 'NOT_ALLOWED',
  'a school instructor cannot put another instructor''s learner in their own diary (PRD 6.2)'
);
select throws_ok(
  format($$ select * from public.book_weekly(%L, %L, %L, pg_temp.at_local(3, '12:00'), 60, 4, true) $$, :'ian', :'lou', :'lesson_type'),
  '42501', 'NOT_ALLOWED',
  'nor give them a weekly slot'
);
select throws_ok(
  format($$ select * from public.book_weekly(%L, %L, %L, pg_temp.at_local(3, '12:00'), 60, 4, true) $$, :'ian', :'liz', :'lesson_type'),
  '42501', 'NOT_ALLOWED',
  'nor give a weekly slot to somebody the school does not teach at all'
);

select tests.clear_authentication();
select is_empty(
  format($$ select id from public.booking_recurrences where learner_id in (%L, %L) $$, :'lou', :'liz'),
  'and no weekly plan is left behind for the nightly sweep to book (BOK-05)'
);

-- ---------------------------------------------------------------------------------------
-- The school's manager books Lou a lesson with Ian (BOK-01).
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'manager_user');
select public.create_booking(:'ian', :'lou', :'lesson_type', pg_temp.at_local(3, '10:00'), 60) as cover \gset

select is(
  (select status::text || ' ' || source::text from public.bookings where id = :'cover'),
  'confirmed instructor',
  'a manager books a cover lesson for Lou with Ian'
);

select tests.clear_authentication();
select is(
  (select instructor_id from public.learner_relationships where business_id = :'school' and learner_id = :'lou'),
  :'ivy'::uuid,
  'and Lou is still Ivy''s learner (LRN-06)'
);

-- ---------------------------------------------------------------------------------------
-- Ian sees who his lesson is with (DIA-03), and nothing else about her.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ian_user');

select results_eq(
  format($$ select full_name from public.users where id = %L $$, :'lou'),
  $$ values ('Lou Two') $$,
  'the instructor on a lesson sees who it is with (DIA-03)'
);
select is_empty(
  $$ select b.id from public.bookings b left join public.users u on u.id = b.learner_id where u.id is null $$,
  'so every lesson in his diary has a name to show'
);
select is_empty(
  format($$ select user_id from public.learner_private where user_id = %L $$, :'lou'),
  'but never her date of birth (R-16)'
);
select is_empty(
  format($$ select body from public.learner_notes where learner_id = %L $$, :'lou'),
  'nor the notes Ivy keeps about her (LRN-04)'
);
select throws_ok(
  format($$ insert into public.learner_notes (business_id, learner_id, author_id, body) values (%L, %L, %L, 'Covered today') $$,
         :'school', :'lou', :'ian_user'),
  '42501', null,
  'and he cannot add one'
);
select is_empty(
  format($$ select user_id from public.learner_profiles where user_id = %L $$, :'lou'),
  'nor her learner profile'
);
select is_empty(
  format($$ select id from public.pickup_points where learner_id = %L $$, :'lou'),
  'nor the pickup points she keeps'
);
select is_empty(
  format($$ select id from public.learner_relationships where learner_id = %L $$, :'lou'),
  'nor her place with the school'
);
select is_empty(
  format($$ select learner_id from public.learner_list where learner_id = %L $$, :'lou'),
  'she is not on his learner list'
);
select is_empty(
  format($$ select learner_id from public.learner_card where learner_id = %L $$, :'lou'),
  'and her learner card does not open for him'
);
select throws_ok(
  format($$ select * from public.learner_history(%L) $$, :'lou'),
  '42501', 'NOT_FOUND',
  'nor the story of who has taught her (LRN-06), which is not found for him (D-131)'
);
select throws_ok(
  format($$ select public.learner_balance(%L, %L) $$, :'school', :'lou'),
  '42501', 'NOT_FOUND',
  'nor what she has paid or owes (PAY-06)'
);

-- ---------------------------------------------------------------------------------------
-- Nobody without a lesson gains anything.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ivy_user');
select is_empty(
  format($$ select id from public.users where id = %L $$, :'lee'),
  'another instructor at the school, with no lesson with a learner, still cannot see them'
);

select tests.authenticate_as(:'asha_user');
select is_empty(
  format($$ select id from public.users where id = %L $$, :'lou'),
  'and an instructor at another Business sees nothing of Lou (acceptance test 7)'
);

-- ---------------------------------------------------------------------------------------
-- What happens to the lesson, and to Ian.
-- ---------------------------------------------------------------------------------------
select tests.clear_authentication();
update public.bookings set status = 'cancelled', cancelled_at = now() where id = :'cover';

select tests.authenticate_as(:'ian_user');
select results_eq(
  format($$ select full_name from public.users where id = %L $$, :'lou'),
  $$ values ('Lou Two') $$,
  'a lesson called off still says who it was with, as the diary still shows it'
);

select tests.clear_authentication();
update public.memberships set status = 'deactivated' where user_id = :'ian_user';

select tests.authenticate_as(:'ian_user');
select is_empty(
  format($$ select id from public.users where id = %L $$, :'lou'),
  'an instructor whose membership has ended no longer sees the learners of their lessons'
);

select tests.clear_authentication();
update public.memberships set status = 'active' where user_id = :'ian_user';

-- ---------------------------------------------------------------------------------------
-- A learner can choose a lesson with somebody else at the school themselves (BOK-02).
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'lee');
select public.create_booking(:'ivy', :'lee', :'lesson_type', pg_temp.at_local(4, '10:00'), 60) as chosen \gset

select tests.clear_authentication();
select is(
  (select instructor_id from public.learner_relationships where business_id = :'school' and learner_id = :'lee'),
  :'ian'::uuid,
  'a learner who books a lesson with another instructor stays with their own'
);

select tests.authenticate_as(:'ivy_user');
select results_eq(
  format($$ select full_name from public.users where id = %L $$, :'lee'),
  $$ values ('Lee One') $$,
  'and the instructor they chose sees who the lesson is with'
);

-- ---------------------------------------------------------------------------------------
-- The people allowed to book still can.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'manager_user');
select is(
  (select count(*)::int
     from public.book_weekly(:'ian', :'lou', :'lesson_type', pg_temp.at_local(5, '15:00'), 60, 2)
    where booking_id is not null),
  2,
  'a manager can give a learner a weekly slot with another instructor, and both weeks are booked'
);

select tests.authenticate_as(:'ian_user');
select lives_ok(
  format($$ select public.create_booking(%L, %L, %L, pg_temp.at_local(6, '10:00'), 60) $$, :'ian', :'lee', :'lesson_type'),
  'a school instructor still books the learners assigned to them'
);
select lives_ok(
  format($$ select * from public.book_weekly(%L, %L, %L, pg_temp.at_local(8, '10:00'), 60, 2) $$, :'ian', :'lee', :'lesson_type'),
  'and gives them a weekly slot'
);

select * from finish();
rollback;
