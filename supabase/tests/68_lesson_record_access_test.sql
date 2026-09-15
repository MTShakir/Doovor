-- Who reads lesson records (PRG-03, PRD 6.2 "View learner progress", M4-03).
--
-- Lee learns with Asha, who runs a Business of one, and with Ian at Bee School. Lou learns with
-- Ivy at Bee School. Ben owns Bee School and Mia manages it. Otto is nobody's.
begin;
select plan(16);

select tests.create_fixture();

\set asha_biz 'aaaa0000-0000-0000-0000-000000000000'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set ben 'b0000000-0000-0000-0000-000000000001'
\set mia 'b0000000-0000-0000-0000-000000000002'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set ivy_user 'b0000000-0000-0000-0000-000000000004'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set lou 'c0000000-0000-0000-0000-000000000002'
\set otto 'd0000000-0000-0000-0000-000000000001'

-- Written straight in, as the table's owner, so each test reads exactly what it sets up.
create or replace function pg_temp.record(p_days_ago integer, p_business uuid, p_instructor uuid, p_learner uuid, p_type uuid, p_visibility text default 'learner')
returns uuid language plpgsql as $$
declare
  v_booking uuid;
  v_record uuid := gen_random_uuid();
  -- A day of its own for each record, so no two lessons meet.
  v_starts timestamptz := now() - make_interval(days => p_days_ago);
begin
  insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                               buffer_minutes, status, price_pence, source)
  values (p_business, p_instructor, p_learner, p_type, v_starts, v_starts + interval '1 hour', 0, 'completed', 4200, 'instructor')
  returning id into v_booking;
  insert into public.lesson_records (id, business_id, booking_id, learner_id, instructor_id, lesson_starts_at, summary, visibility)
  values (v_record, p_business, v_booking, p_learner, p_instructor, v_starts, 'A lesson', p_visibility::public.lesson_record_visibility);
  insert into public.skill_ratings (lesson_record_id, skill_code, rating, business_id, learner_id)
  values (v_record, 'JUNCTIONS', 3, p_business, p_learner);
  return v_record;
end;
$$;

-- Lee with Asha; Lee with Ian; Lou with Ivy; Lee with Ivy, covering for Ian; one Bee School
-- record for Lee kept for the Business.
select pg_temp.record(2, :'asha_biz', 'a1000000-0000-0000-0000-000000000001', :'lee', 'a2000000-0000-0000-0000-000000000001') as lee_asha \gset
select pg_temp.record(3, :'school', 'b1000000-0000-0000-0000-000000000001', :'lee', 'b2000000-0000-0000-0000-000000000001') as lee_ian \gset
select pg_temp.record(4, :'school', 'b1000000-0000-0000-0000-000000000002', :'lou', 'b2000000-0000-0000-0000-000000000001') as lou_ivy \gset
select pg_temp.record(5, :'school', 'b1000000-0000-0000-0000-000000000002', :'lee', 'b2000000-0000-0000-0000-000000000001') as lee_cover \gset
select pg_temp.record(6, :'school', 'b1000000-0000-0000-0000-000000000001', :'lee', 'b2000000-0000-0000-0000-000000000001', 'business') as lee_kept \gset

create or replace function pg_temp.visible()
returns setof uuid language sql as $$ select id from public.lesson_records $$;

-- ---------------------------------------------------------------------------------------
-- The learner.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'lee');
select set_eq(
  $$ select * from pg_temp.visible() $$,
  format($$ values (%L::uuid), (%L::uuid), (%L::uuid) $$, :'lee_asha', :'lee_ian', :'lee_cover'),
  'a learner reads their own records from every Business they learn with'
);
select is(
  (select count(*)::int from public.lesson_records where id = :'lee_kept'::uuid),
  0,
  'but not one the Business kept for itself'
);
select is(
  (select count(*)::int from public.skill_ratings),
  3,
  'and the ratings in exactly the records they can read'
);

select tests.authenticate_as(:'lou');
select set_eq($$ select * from pg_temp.visible() $$, format($$ values (%L::uuid) $$, :'lou_ivy'), 'another learner reads only their own');

-- ---------------------------------------------------------------------------------------
-- Instructors.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ian_user');
select set_eq(
  $$ select * from pg_temp.visible() $$,
  format($$ values (%L::uuid), (%L::uuid), (%L::uuid) $$, :'lee_ian', :'lee_cover', :'lee_kept'),
  'an instructor at a school reads every school record for a learner assigned to them, a cover lesson and a kept record included'
);
select is(
  (select count(*)::int from public.lesson_records where id in (:'lee_asha'::uuid, :'lou_ivy'::uuid)),
  0,
  'and nothing from another Business, or for a colleague''s learner'
);

select tests.authenticate_as(:'ivy_user');
select set_eq(
  $$ select * from pg_temp.visible() $$,
  format($$ values (%L::uuid), (%L::uuid) $$, :'lou_ivy', :'lee_cover'),
  'an instructor reads their own learner''s records, and the record of a lesson they covered, and no more'
);

select tests.authenticate_as(:'asha_user');
select set_eq(
  $$ select * from pg_temp.visible() $$,
  format($$ values (%L::uuid) $$, :'lee_asha'),
  'somebody running a Business of one reads their own records, not the school''s for the same learner'
);
select is(
  (select count(*)::int from public.skill_ratings where lesson_record_id = :'lee_ian'::uuid),
  0,
  'nor the ratings in them'
);

-- ---------------------------------------------------------------------------------------
-- The people who run a school.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ben');
select set_eq(
  $$ select * from pg_temp.visible() $$,
  format($$ values (%L::uuid), (%L::uuid), (%L::uuid), (%L::uuid) $$, :'lee_ian', :'lou_ivy', :'lee_cover', :'lee_kept'),
  'the owner reads every record written at the school'
);
select tests.authenticate_as(:'mia');
select is((select count(*)::int from pg_temp.visible()), 4, 'and so does the manager');
select is(
  (select count(*)::int from public.lesson_records where id = :'lee_asha'::uuid),
  0,
  'but neither reads a record another Business wrote for the same learner'
);

-- ---------------------------------------------------------------------------------------
-- Everybody else.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'otto');
select is((select count(*)::int from pg_temp.visible()), 0, 'somebody with no part in it reads nothing');
select is((select count(*)::int from public.skill_ratings), 0, 'and no ratings');

select tests.clear_authentication();
set local role anon;
select throws_ok($$ select count(*) from public.lesson_records $$, '42501', null, 'nobody signed out reads records at all');
select throws_ok($$ select count(*) from public.skill_ratings $$, '42501', null, 'or ratings');
reset role;

select * from finish();
rollback;
