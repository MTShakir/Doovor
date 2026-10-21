-- A record for a lesson started early (PRG-01, D-178, D-316): from the quarter of an hour its card offers to start it, not before.
begin;
select plan(3);

select tests.create_fixture();

\set ian_user 'b0000000-0000-0000-0000-000000000003'

create function pg_temp.lesson(p_starts timestamptz)
returns uuid language sql as $$
  insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                               buffer_minutes, status, price_pence, source)
  values ('bbbb0000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000001',
          'c0000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
          p_starts, p_starts + interval '1 hour', 0, 'confirmed', 4200, 'instructor')
  returning id;
$$;

select pg_temp.lesson(now() + interval '10 minutes') as soon \gset
select pg_temp.lesson(now() + interval '3 hours') as later \gset

select tests.authenticate_as(:'ian_user');

select is(
  (public.save_lesson_record(gen_random_uuid(), :'soon', '[{"skill_code": "CTRL", "rating": 3}]', 'Started early') ->> 'saved')::boolean,
  true,
  'a lesson started early by its card has its record'
);
select is(
  (select status::text from public.bookings where id = :'soon'),
  'completed',
  'and is marked done by it, as one started on time is'
);
select throws_ok(
  format($$ select public.save_lesson_record(gen_random_uuid(), %L, '[{"skill_code": "CTRL", "rating": 3}]', 'Too soon') $$, :'later'),
  'P0001', 'LESSON_NOT_STARTED',
  'a lesson further off is refused, saying it has not started'
);
reset role;

select * from finish();
rollback;
