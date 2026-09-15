-- Where a learner is with each area of the skill map (PRG-03, M4-07).
--
-- Lee learns with Asha, who runs a Business of one, and with Ian at Bee School. Lou learns with
-- Ivy at Bee School. Ben owns Bee School. Otto is nobody's.
begin;
select plan(11);

select tests.create_fixture();

\set asha_biz 'aaaa0000-0000-0000-0000-000000000000'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set asha 'a1000000-0000-0000-0000-000000000001'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set ivy 'b1000000-0000-0000-0000-000000000002'
\set asha_type 'a2000000-0000-0000-0000-000000000001'
\set school_type 'b2000000-0000-0000-0000-000000000001'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set ben 'b0000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set lou 'c0000000-0000-0000-0000-000000000002'
\set otto 'd0000000-0000-0000-0000-000000000001'

-- A lesson some days ago and its record, written straight in as the table's owner, with its
-- ratings as {"JUNCTIONS": 3}. A day of its own for each lesson, so no two meet.
create or replace function pg_temp.record(p_days_ago integer, p_business uuid, p_instructor uuid, p_learner uuid,
                                          p_type uuid, p_ratings jsonb, p_visibility text default 'learner')
returns uuid language plpgsql as $$
declare
  v_booking uuid;
  v_record uuid := gen_random_uuid();
  v_starts timestamptz := date_trunc('minute', now()) - make_interval(days => p_days_ago);
begin
  insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                               buffer_minutes, status, price_pence, source)
  values (p_business, p_instructor, p_learner, p_type, v_starts, v_starts + interval '1 hour', 0, 'completed', 4200, 'instructor')
  returning id into v_booking;
  insert into public.lesson_records (id, business_id, booking_id, learner_id, instructor_id, lesson_starts_at, summary, visibility)
  values (v_record, p_business, v_booking, p_learner, p_instructor, v_starts, 'A lesson', p_visibility::public.lesson_record_visibility);
  insert into public.skill_ratings (lesson_record_id, skill_code, rating, business_id, learner_id)
  select v_record, key, value::smallint, p_business, p_learner from jsonb_each_text(p_ratings);
  return v_record;
end;
$$;

-- Lee at Bee School: junctions introduced ten days ago, better three days ago, and a record for the
-- lesson six days ago that arrives after both, from a phone that had no signal.
select pg_temp.record(10, :'school', :'ian', :'lee', :'school_type', '{"JUNCTIONS": 2, "MIRRORS": 3}');
select pg_temp.record(3, :'school', :'ian', :'lee', :'school_type', '{"JUNCTIONS": 4}');
select pg_temp.record(6, :'school', :'ian', :'lee', :'school_type', '{"JUNCTIONS": 3}');
-- Lee with Asha, and a record Bee School kept for itself yesterday.
select pg_temp.record(2, :'asha_biz', :'asha', :'lee', :'asha_type', '{"ROUNDABOUT": 5}');
select pg_temp.record(1, :'school', :'ian', :'lee', :'school_type', '{"JUNCTIONS": 1}', 'business');
-- Lou at Bee School.
select pg_temp.record(4, :'school', :'ivy', :'lou', :'school_type', '{"JUNCTIONS": 5}');

-- Each area as "CODE rating, rated N times, last N days ago".
create or replace function pg_temp.map(p_learner uuid)
returns setof text language sql as $$
  select format('%s %s, rated %s times, last %s days ago', skill_code, rating, times,
                extract(day from date_trunc('minute', now()) - last_rated_at)::int)
    from public.skill_progress
   where learner_id = p_learner
   order by skill_code
$$;

-- ---------------------------------------------------------------------------------------
-- The learner.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'lee');
select results_eq(
  format($$ select * from pg_temp.map(%L) $$, :'lee'),
  $$ values ('JUNCTIONS 4, rated 3 times, last 3 days ago'), ('MIRRORS 3, rated 1 times, last 10 days ago'),
            ('ROUNDABOUT 5, rated 1 times, last 2 days ago') $$,
  'a learner''s map holds each area at its rating from the lesson that happened last, not the record that arrived last, from every Business they learn with'
);
select is(
  (select count(*)::int from public.skill_progress where learner_id = :'lee'::uuid and rating = 1),
  0,
  'and not a rating from a record the Business kept for itself'
);
select is((select count(*)::int from public.skill_progress where learner_id <> :'lee'::uuid), 0, 'a learner sees nobody else''s map');

-- ---------------------------------------------------------------------------------------
-- Instructors.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ian_user');
select results_eq(
  format($$ select * from pg_temp.map(%L) $$, :'lee'),
  $$ values ('JUNCTIONS 1, rated 4 times, last 1 days ago'), ('MIRRORS 3, rated 1 times, last 10 days ago') $$,
  'an instructor''s map of their learner is made of the records written where they teach them, kept ones included'
);
select is((select count(*)::int from public.skill_progress where learner_id = :'lou'::uuid), 0, 'and they have no map of a colleague''s learner');

select tests.authenticate_as(:'asha_user');
select results_eq(
  format($$ select * from pg_temp.map(%L) $$, :'lee'),
  $$ values ('ROUNDABOUT 5, rated 1 times, last 2 days ago') $$,
  'somebody running a Business of one sees the map their own records make, not the school''s'
);

-- ---------------------------------------------------------------------------------------
-- The people who run a school, and everybody else.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ben');
select results_eq(
  format($$ select * from pg_temp.map(%L) $$, :'lee'),
  $$ values ('JUNCTIONS 1, rated 4 times, last 1 days ago'), ('MIRRORS 3, rated 1 times, last 10 days ago') $$,
  'the owner of a school sees each learner''s map from the school''s records'
);
select results_eq(
  format($$ select * from pg_temp.map(%L) $$, :'lou'),
  $$ values ('JUNCTIONS 5, rated 1 times, last 4 days ago') $$,
  'for every learner there'
);

select tests.authenticate_as(:'otto');
select is((select count(*)::int from public.skill_progress), 0, 'somebody with no part in it sees no map');

select tests.clear_authentication();
set local role anon;
select throws_ok($$ select count(*) from public.skill_progress $$, '42501', null, 'nobody signed out sees one at all');
reset role;

select is(
  (select count(*)::int from public.skill_progress),
  4,
  'with nothing hidden, there is one row for each area each learner was rated in, however many times: four in all'
);

select * from finish();
rollback;
