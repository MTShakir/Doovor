-- What a learner is told when their lesson record is saved (NTF-03, M4-12).
--
-- Ian teaches Lee at Bee School.
begin;
select plan(5);

select tests.create_fixture();

\set school 'bbbb0000-0000-0000-0000-000000000000'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set lee 'c0000000-0000-0000-0000-000000000001'

-- A lesson some days ago and its record, written straight in as the table's owner.
create or replace function pg_temp.record(p_days_ago integer, p_visibility text)
returns uuid language plpgsql as $$
declare
  v_booking uuid;
  v_record uuid := gen_random_uuid();
  v_starts timestamptz := date_trunc('minute', now()) - make_interval(days => p_days_ago);
begin
  insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                               buffer_minutes, status, price_pence, source)
  values ('bbbb0000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000001',
          'c0000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
          v_starts, v_starts + interval '1 hour', 0, 'completed', 4200, 'instructor')
  returning id into v_booking;
  insert into public.lesson_records (id, business_id, booking_id, learner_id, instructor_id, lesson_starts_at, summary, visibility)
  values (v_record, 'bbbb0000-0000-0000-0000-000000000000', v_booking, 'c0000000-0000-0000-0000-000000000001',
          'b1000000-0000-0000-0000-000000000001', v_starts, 'Good junctions today', p_visibility::public.lesson_record_visibility);
  return v_record;
end;
$$;

select pg_temp.record(2, 'learner') as for_lee \gset
select pg_temp.record(3, 'business') as kept \gset

select results_eq(
  format($$ select n ->> 'learner_user_id', n ->> 'instructor_name', n ->> 'summary', n ->> 'business_id',
                   (n ->> 'lesson_starts_at')::timestamptz = date_trunc('minute', now()) - interval '2 days'
              from (select public.system_lesson_record_notice(%L) as n) as notice $$, :'for_lee'),
  format($$ values (%L, 'Ian', 'Good junctions today', %L, true) $$, :'lee', :'school'),
  'a saved record concerns its learner: who wrote it, for which lesson, and what it says'
);
select is(
  public.system_lesson_record_notice(:'kept'),
  null,
  'a record the Business kept for itself is nothing to tell the learner about'
);
select is(public.system_lesson_record_notice(gen_random_uuid()), null, 'nor is a record that is not there');

select tests.authenticate_as(:'ian_user');
select throws_ok(
  format($$ select public.system_lesson_record_notice(%L) $$, :'for_lee'),
  '42501', null,
  'nobody signed in can ask what a record says through the job''s door'
);
select tests.clear_authentication();

set local role anon;
select throws_ok(
  format($$ select public.system_lesson_record_notice(%L) $$, :'for_lee'),
  '42501', null,
  'nor anybody signed out'
);
reset role;

select * from finish();
rollback;
