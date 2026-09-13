-- The learner list shows a Business its own learners and nobody else's (LRN-01, M2-04).
begin;
select plan(11);

select tests.create_fixture();

\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set ivy_user 'b0000000-0000-0000-0000-000000000004'
\set manager_user 'b0000000-0000-0000-0000-000000000002'
\set outsider 'd0000000-0000-0000-0000-000000000001'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set lou 'c0000000-0000-0000-0000-000000000002'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set ian 'b1000000-0000-0000-0000-000000000001'

-- Lee has two lessons behind him with Ian and one to come. The cancelled one counts for
-- nothing, and the lesson in Asha's Business belongs to Asha's row, not to this one.
insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                             buffer_minutes, status, price_pence, source)
values (:'school', :'ian', :'lee', 'b2000000-0000-0000-0000-000000000001',
        now() - interval '14 days', now() - interval '14 days' + interval '1 hour', 30, 'completed', 4200, 'instructor'),
       (:'school', :'ian', :'lee', 'b2000000-0000-0000-0000-000000000001',
        now() - interval '7 days', now() - interval '7 days' + interval '1 hour', 30, 'completed', 4200, 'instructor'),
       (:'school', :'ian', :'lee', 'b2000000-0000-0000-0000-000000000001',
        now() - interval '2 days', now() - interval '2 days' + interval '1 hour', 30, 'cancelled', 4200, 'instructor'),
       (:'school', :'ian', :'lee', 'b2000000-0000-0000-0000-000000000001',
        now() + interval '3 days', now() + interval '3 days' + interval '1 hour', 30, 'confirmed', 4200, 'instructor'),
       (:'school', :'ian', :'lee', 'b2000000-0000-0000-0000-000000000001',
        now() + interval '10 days', now() + interval '10 days' + interval '1 hour', 30, 'confirmed', 4200, 'instructor');

update public.learner_relationships set status = 'test_booked'
 where business_id = :'school' and learner_id = :'lee';

-- ---------------------------------------------------------------------------------------
-- What an instructor sees.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ian_user');

select is(
  (select count(*)::int from public.learner_list),
  1,
  'an instructor sees the learners assigned to them and no others'
);
select is(
  (select full_name from public.learner_list),
  'Lee One',
  'with the learner named'
);
select is(
  (select lessons_taken from public.learner_list),
  2,
  'lessons taken counts completed lessons only'
);
select ok(
  (select next_lesson_at from public.learner_list) between now() + interval '2 days' and now() + interval '4 days',
  'the next lesson is the soonest one still to come'
);
select ok(
  (select last_lesson_at from public.learner_list) < now(),
  'the last lesson is behind them'
);
select is(
  (select status::text from public.learner_list),
  'test_booked',
  'and the status is the one on the relationship'
);

select is(
  (select count(*)::int from public.learner_list where learner_id = :'lou'),
  0,
  'a learner taught by somebody else in the same school is not on this list'
);

-- ---------------------------------------------------------------------------------------
-- What everybody else sees.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'manager_user');
select is(
  (select count(*)::int from public.learner_list),
  2,
  'a manager sees every learner in the school'
);

select tests.authenticate_as(:'asha_user');
select is(
  (select business_id from public.learner_list),
  'aaaa0000-0000-0000-0000-000000000000'::uuid,
  'an independent instructor sees only their own Business'
);
select is(
  (select lessons_taken from public.learner_list),
  0,
  'and lessons taught by somebody else are not counted on their row'
);

select tests.authenticate_as(:'outsider');
select is(
  (select count(*)::int from public.learner_list),
  0,
  'somebody with no Business sees nothing at all'
);

select * from finish();
rollback;
