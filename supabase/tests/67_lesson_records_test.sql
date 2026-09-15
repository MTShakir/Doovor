-- Saving a lesson record (PRG-01, PRG-09, M4-02).
begin;
select plan(21);

select tests.create_fixture();

\set school 'bbbb0000-0000-0000-0000-000000000000'
\set ben 'b0000000-0000-0000-0000-000000000001'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set ivy_user 'b0000000-0000-0000-0000-000000000004'
\set lee 'c0000000-0000-0000-0000-000000000001'

create or replace function pg_temp.lesson(p_starts timestamptz, p_status text)
returns uuid language sql as $$
  insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                               buffer_minutes, status, price_pence, source)
  values ('bbbb0000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000001',
          'c0000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
          p_starts, p_starts + interval '1 hour', 0, p_status::public.booking_status, 4200, 'instructor')
  returning id;
$$;

create or replace function pg_temp.save(p_id uuid, p_booking uuid, p_ratings jsonb, p_summary text default 'Good junctions today')
returns jsonb language sql as $$
  select public.save_lesson_record(p_id, p_booking, p_ratings, p_summary, 'Roundabouts', null, 48);
$$;

select pg_temp.lesson(now() - interval '2 hours', 'completed') as taught \gset
select pg_temp.lesson(now() - interval '30 minutes', 'confirmed') as just_taught \gset
select pg_temp.lesson(now() + interval '1 day', 'confirmed') as tomorrow \gset
select pg_temp.lesson(now() - interval '1 day', 'cancelled') as called_off \gset
select pg_temp.lesson(now() - interval '4 hours', 'completed') as spare \gset
select gen_random_uuid() as record \gset

\set two_skills '[{"skill_code": "JUNCTIONS", "rating": 3}, {"skill_code": "MIRRORS", "rating": 4}]'

-- ---------------------------------------------------------------------------------------
-- Saved once, however often it is sent.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ian_user');

select is(
  pg_temp.save(:'record', :'taught', :'two_skills'),
  jsonb_build_object('id', :'record'::uuid, 'saved', true, 'completed', false),
  'the instructor who taught the lesson saves its record'
);
select is(
  pg_temp.save(:'record', :'taught', :'two_skills'),
  jsonb_build_object('id', :'record'::uuid, 'saved', false, 'completed', false),
  'the same record sent again is already saved'
);
select is(
  pg_temp.save(:'record', :'taught', '[{"skill_code": "ECO", "rating": 1}]', 'Something else entirely'),
  jsonb_build_object('id', :'record'::uuid, 'saved', false, 'completed', false),
  'and sending it again with other words changes nothing'
);
select throws_ok(
  format($$ select pg_temp.save(gen_random_uuid(), %L, %L) $$, :'taught', :'two_skills'),
  'P0001', 'ALREADY_RECORDED',
  'another device''s record for the same lesson is refused'
);

select tests.clear_authentication();

select results_eq(
  format($$ select count(*)::int, min(summary), min(next_focus), min(seconds_taken), min(visibility::text)
              from public.lesson_records where booking_id = %L $$, :'taught'),
  $$ values (1, 'Good junctions today', 'Roundabouts', 48, 'learner') $$,
  'one record for the lesson, as it was first saved, for the learner'
);
select is(
  (select r.lesson_starts_at = b.starts_at
     from public.lesson_records r join public.bookings b on b.id = r.booking_id
    where r.id = :'record'::uuid),
  true,
  'kept with when the lesson started, which is when it goes on the learner''s timeline (PRG-03)'
);
select results_eq(
  format($$ select skill_code, rating::int, learner_id, business_id from public.skill_ratings
             where lesson_record_id = %L order by skill_code $$, :'record'),
  format($$ values ('JUNCTIONS', 3, %L::uuid, %L::uuid), ('MIRRORS', 4, %L::uuid, %L::uuid) $$, :'lee', :'school', :'lee', :'school'),
  'and one rating for each skill, kept with the learner and the Business'
);
select is(
  (select count(*)::int from public.audit_log where entity = 'lesson_record' and entity_id = :'record'::uuid),
  1,
  'the save is audited once'
);
select is(
  (select count(*)::int from public.outbox_events where name = 'lesson_record.added' and payload ->> 'lesson_record_id' = :'record'),
  1,
  'and the learner is to be told once (M4-12)'
);

-- ---------------------------------------------------------------------------------------
-- Which lessons have records.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ian_user');

select is(
  (pg_temp.save(gen_random_uuid(), :'just_taught', '[{"skill_code": "CTRL", "rating": 2}]') ->> 'completed')::boolean,
  true,
  'a lesson that has started and was not marked done is marked done by saving its record'
);
select throws_ok(
  format($$ select pg_temp.save(gen_random_uuid(), %L, %L) $$, :'tomorrow', :'two_skills'),
  'P0001', 'TOO_CLOSE',
  'a lesson that has not started has nothing to record'
);
select throws_ok(
  format($$ select pg_temp.save(gen_random_uuid(), %L, %L) $$, :'called_off', :'two_skills'),
  'P0001', 'VALIDATION_FAILED',
  'nor does a lesson that was called off'
);

-- ---------------------------------------------------------------------------------------
-- What a record has to say.
-- ---------------------------------------------------------------------------------------
select throws_ok(
  format($$ select pg_temp.save(gen_random_uuid(), %L, '[]') $$, :'spare'),
  'P0001', 'VALIDATION_FAILED', 'at least one skill'
);
select throws_ok(
  format($$ select pg_temp.save(gen_random_uuid(), %L, '[{"skill_code": "PARKING", "rating": 3}]') $$, :'spare'),
  'P0001', 'VALIDATION_FAILED', 'only skills on the map'
);
select throws_ok(
  format($$ select pg_temp.save(gen_random_uuid(), %L, '[{"skill_code": "CTRL", "rating": 6}]') $$, :'spare'),
  'P0001', 'VALIDATION_FAILED', 'rated from 1 to 5'
);
select throws_ok(
  format($$ select pg_temp.save(gen_random_uuid(), %L, '[{"skill_code": "CTRL", "rating": 2}, {"skill_code": "CTRL", "rating": 4}]') $$, :'spare'),
  'P0001', 'VALIDATION_FAILED', 'each skill once'
);
select throws_ok(
  format($$ select pg_temp.save(gen_random_uuid(), %L, '[{"skill_code": "CTRL", "rating": 2}]', '   ') $$, :'spare'),
  'P0001', 'VALIDATION_FAILED', 'and a line about the lesson'
);
select is((select count(*)::int from public.lesson_records where booking_id = :'spare'::uuid), 0, 'a refused record leaves nothing behind');

select tests.clear_authentication();

-- ---------------------------------------------------------------------------------------
-- Who writes them (PRD 6.2: owners and managers do not).
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ben');
select throws_ok(
  format($$ select pg_temp.save(gen_random_uuid(), %L, %L) $$, :'spare', :'two_skills'),
  '42501', 'NOT_FOUND',
  'the owner of the school does not write an instructor''s records'
);
select tests.authenticate_as(:'ivy_user');
select throws_ok(
  format($$ insert into public.lesson_records (id, business_id, booking_id, learner_id, instructor_id, summary)
             values (gen_random_uuid(), %L, %L, %L, %L, 'Written straight in') $$, :'school', :'spare', :'lee', :'ian'),
  '42501', null,
  'nor does anybody write one straight into the table'
);
select tests.clear_authentication();

select throws_ok(
  format($$ select public.save_lesson_record(gen_random_uuid(), %L, '[{"skill_code": "CTRL", "rating": 2}]', 'Hello') $$, :'spare'),
  '42501', 'NOT_AUTHENTICATED',
  'nobody signed in saves anything'
);

select * from finish();
rollback;
